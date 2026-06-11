/**
 * bylestherdev — main.js
 * jQuery 3.x requerido
 *
 * Módulos activos:
 *  1. Utils        — throttle (usado por FloatCTA)
 *  2. Calculator   — calculadora con checkboxes + sliders
 *  3. FloatCTA     — botón flotante aparece/desaparece con scroll
 *  4. LeadCapture  — guarda interacciones en sessionStorage
 */

(function ($) {
  'use strict';

  /* ─── CONFIGURACIÓN ─── */
  var CONFIG = {
    weeksPerMonth : 4.3,
    storageKey    : 'bld_lead_data',
    // Cada opción suma horas semanales al total
    painOptions: [
      { label: 'Copiar datos entre apps',         hours: 5  },
      { label: 'Responder preguntas repetitivas', hours: 4  },
      { label: 'Leads sin responder a tiempo',    hours: 3  },
      { label: 'Seguimiento manual por WhatsApp', hours: 4  },
      { label: '+10 hrs/semana en tareas rep.',   hours: 10 }
    ]
  };

  /* ─────────────────────────────────────────────
   * 1. UTILS — declarado primero para que todos lo puedan usar
   * ───────────────────────────────────────────── */
  var Utils = {
    throttle: function (fn, delay) {
      var last = 0;
      return function () {
        var now = Date.now();
        if (now - last >= delay) {
          last = now;
          fn.apply(this, arguments);
        }
      };
    }
  };

  /* ─────────────────────────────────────────────
   * 2. CALCULATOR
   * ───────────────────────────────────────────── */
  var Calculator = {
    baseHours    : 10,
    baseCost     : 15,
    extraHours   : 0,   // acumulado por checkboxes
    checkedIds   : [],

    init: function () {
      if (!$('#hrs-range').length) return;

      var self = this;

      // Sliders
      $('#hrs-range').on('input', function () {
        self.baseHours = +this.value;
        self.render();
      });

      $('#cost-range').on('input', function () {
        self.baseCost = +this.value;
        self.render();
      });

      // Checkboxes — usa data-index puesto desde init
      $('.pain-checks .pain-check').each(function (i) {
        $(this).find('.ck').attr('data-idx', i);
      });

      $(document).on('click', '.ck', function () {
        var $ck  = $(this);
        var idx  = parseInt($ck.attr('data-idx'), 10);
        var opt  = CONFIG.painOptions[idx];
        if (!opt) return;

        $ck.toggleClass('checked');

        if ($ck.hasClass('checked')) {
          self.extraHours += opt.hours;
          self.checkedIds.push(idx);
        } else {
          self.extraHours = Math.max(0, self.extraHours - opt.hours);
          self.checkedIds = self.checkedIds.filter(function (i) { return i !== idx; });
        }

        // Actualiza el slider de horas para reflejar el total
        var totalHours = Math.min(40, self.baseHours + self.extraHours);
        $('#hrs-range').val(totalHours);

        self.render();
        LeadCapture.update('checkedOptions', self.checkedIds);
      });

      this.render();
    },

    render: function () {
      var hours   = Math.min(40, this.baseHours + this.extraHours);
      var cost    = this.baseCost;
      var monthly = Math.round(hours * cost * CONFIG.weeksPerMonth);

      $('#hrs-val').text(hours + ' hrs');
      $('#cost-val').text('$' + cost + ' USD');
      $('#calc-out').text('$' + monthly.toLocaleString('es-CL') + ' USD/mes');

      // Pulso visual
      $('#calc-out').addClass('calc-pulse');
      setTimeout(function () { $('#calc-out').removeClass('calc-pulse'); }, 400);
    },

    getResult: function () {
      var hours = Math.min(40, this.baseHours + this.extraHours);
      return {
        hours    : hours,
        cost     : this.baseCost,
        monthly  : Math.round(hours * this.baseCost * CONFIG.weeksPerMonth),
        checked  : this.checkedIds.map(function (i) { return CONFIG.painOptions[i] ? CONFIG.painOptions[i].label : ''; })
      };
    }
  };

  /* ─────────────────────────────────────────────
   * 3. FLOAT CTA
   * ───────────────────────────────────────────── */
  var FloatCTA = {
    init: function () {
      var $btn = $('.float-cta');
      if (!$btn.length) return;

      // Estado inicial: oculto
      $btn.css({ opacity: '0', 'pointer-events': 'none', transition: 'opacity 0.3s ease' });

      $(window).on('scroll', Utils.throttle(function () {
        var scrolled    = $(window).scrollTop();
        var docHeight   = $(document).height();
        var winHeight   = $(window).height();
        var nearBottom  = (scrolled + winHeight) > (docHeight - 200);

        if (scrolled > 350 && !nearBottom) {
          $btn.css({ opacity: '1', 'pointer-events': 'auto' });
        } else {
          $btn.css({ opacity: '0', 'pointer-events': 'none' });
        }
      }, 80));
    }
  };

  /* ─────────────────────────────────────────────
   * 4. LEAD CAPTURE
   * ───────────────────────────────────────────── */
  var LeadCapture = {
    data: {},

    init: function () {
      try {
        var saved = sessionStorage.getItem(CONFIG.storageKey);
        if (saved) this.data = JSON.parse(saved);
      } catch (e) {}

      this.update('visit', new Date().toISOString());
      this.update('referrer', document.referrer || 'directo');
      this.trackCTAs();
    },

    update: function (key, value) {
      this.data[key] = value;
      try {
        sessionStorage.setItem(CONFIG.storageKey, JSON.stringify(this.data));
      } catch (e) {}
    },

    trackCTAs: function () {
      var self = this;
      $(document).on('click', 'a[href*="calendly"], a[href*="wa.me"], a[href*="mailto"]', function () {
        var href  = $(this).attr('href') || '';
        var type  = href.indexOf('calendly') > -1 ? 'calendly'
                  : href.indexOf('wa.me')    > -1 ? 'whatsapp'
                  : 'email';
        var clicks = self.data.ctaClicks || [];
        clicks.push({ type: type, label: $(this).text().trim(), time: new Date().toISOString() });
        self.update('ctaClicks', clicks);
        self.update('calcResult', Calculator.getResult());
      });
    },

    // Llama window.bld.leads() desde consola para ver los datos
    export: function () {
      return JSON.parse(JSON.stringify(this.data));
    }
  };

  /* ─────────────────────────────────────────────
   * INIT
   * ───────────────────────────────────────────── */
  $(document).ready(function () {
    LeadCapture.init();
    Calculator.init();
    FloatCTA.init();

    // Debug: window.bld.leads() en consola
    window.bld = {
      leads : function () { return LeadCapture.export(); },
      calc  : function () { return Calculator.getResult(); }
    };
  });

})(jQuery);
