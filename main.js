/**
 * bylestherdev — main.js
 * Requiere jQuery 3.x
 *
 * Módulos:
 *  1. Calculator       — calculadora interactiva con pesos por opción
 *  2. LeadCapture      — registra selecciones del visitante en sessionStorage
 *  3. Animations       — observers para entradas suaves al hacer scroll
 *  4. FloatCTA         — muestra/oculta el botón flotante según scroll
 *  5. NavScroll        — marca el link activo en la nav según sección visible
 *  6. Utils            — helpers compartidos
 */

(function ($) {
  'use strict';

  /* ─────────────────────────────────────────────
   * CONFIGURACIÓN GLOBAL
   * ───────────────────────────────────────────── */
  const CONFIG = {
    // Cada opción del checklist suma horas y costo/hora al estimado
    painOptions: [
      { id: 0, label: 'Copiar datos entre apps',         hoursPerWeek: 5,  costPerHour: 15 },
      { id: 1, label: 'Responder preguntas repetitivas', hoursPerWeek: 4,  costPerHour: 12 },
      { id: 2, label: 'Leads sin responder a tiempo',    hoursPerWeek: 3,  costPerHour: 20 },
      { id: 3, label: 'Seguimiento manual por WhatsApp', hoursPerWeek: 4,  costPerHour: 12 },
      { id: 4, label: '+10 horas/semana en tareas rep.',  hoursPerWeek: 10, costPerHour: 15 },
    ],
    weeksPerMonth: 4.3,
    animationClass: 'bld-visible',
    storageKey: 'bld_lead_data',
  };

  /* ─────────────────────────────────────────────
   * 1. CALCULATOR
   * Gestiona sliders + checkboxes y recalcula en tiempo real
   * ───────────────────────────────────────────── */
  const Calculator = {
    // Valores actuales
    state: {
      manualHours: 10,
      costPerHour: 15,
      checkedOptions: [],
    },

    init() {
      if (!$('#hrs-range').length) return;

      // Escucha sliders
      $('#hrs-range').on('input', (e) => {
        this.state.manualHours = +e.target.value;
        this.render();
        LeadCapture.update('sliderHours', this.state.manualHours);
      });

      $('#cost-range').on('input', (e) => {
        this.state.costPerHour = +e.target.value;
        this.render();
        LeadCapture.update('sliderCost', this.state.costPerHour);
      });

      // Escucha checkboxes del pain section
      $(document).on('click', '.ck', (e) => {
        const $ck  = $(e.currentTarget);
        const idx  = $ck.closest('.pain-check').index();
        const opt  = CONFIG.painOptions[idx];
        $ck.toggleClass('checked');

        if ($ck.hasClass('checked')) {
          this.state.checkedOptions.push(idx);
          // Suma horas y costo sugerido por la opción
          this.state.manualHours = Math.min(
            40,
            this.state.manualHours + opt.hoursPerWeek
          );
          this.state.costPerHour = Math.round(
            (this.state.costPerHour + opt.costPerHour) / 2
          );
        } else {
          this.state.checkedOptions = this.state.checkedOptions.filter(i => i !== idx);
          // Resta al desmarcar
          this.state.manualHours = Math.max(
            2,
            this.state.manualHours - opt.hoursPerWeek
          );
        }

        // Sincroniza sliders con nuevos valores
        $('#hrs-range').val(this.state.manualHours);
        $('#cost-range').val(this.state.costPerHour);

        this.render();
        LeadCapture.update('checkedOptions', this.state.checkedOptions);
      });

      this.render();
    },

    render() {
      const { manualHours, costPerHour } = this.state;
      const monthly = Math.round(manualHours * costPerHour * CONFIG.weeksPerMonth);

      $('#hrs-val').text(manualHours + ' hrs');
      $('#cost-val').text('$' + costPerHour + ' USD');
      $('#calc-out').text('$' + monthly.toLocaleString('es-CL') + ' USD/mes');

      // Animación de pulso cuando el valor sube
      $('#calc-out').addClass('calc-pulse');
      setTimeout(() => $('#calc-out').removeClass('calc-pulse'), 400);
    },

    getResult() {
      const { manualHours, costPerHour, checkedOptions } = this.state;
      return {
        manualHours,
        costPerHour,
        monthlyLoss: Math.round(manualHours * costPerHour * CONFIG.weeksPerMonth),
        checkedLabels: checkedOptions.map(i => CONFIG.painOptions[i]?.label),
      };
    },
  };

  /* ─────────────────────────────────────────────
   * 2. LEAD CAPTURE
   * Guarda datos del visitante en sessionStorage para análisis
   * Se puede reemplazar sessionStorage por un POST a tu backend
   * ───────────────────────────────────────────── */
  const LeadCapture = {
    data: {},

    init() {
      // Recupera sesión previa si existe
      try {
        const saved = sessionStorage.getItem(CONFIG.storageKey);
        if (saved) this.data = JSON.parse(saved);
      } catch (_) {}

      this.update('landingVisit', new Date().toISOString());
      this.update('referrer', document.referrer || 'directo');
      this.trackCTAClicks();
    },

    update(key, value) {
      this.data[key] = value;
      this.save();
    },

    save() {
      try {
        sessionStorage.setItem(CONFIG.storageKey, JSON.stringify(this.data));
      } catch (_) {}
    },

    trackCTAClicks() {
      // Registra qué CTA clickeó el visitante
      $(document).on('click', 'a[href*="calendly"], a[href*="wa.me"], a[href*="mailto"]', (e) => {
        const href   = $(e.currentTarget).attr('href') || '';
        const type   = href.includes('calendly') ? 'calendly'
                     : href.includes('wa.me')    ? 'whatsapp'
                     : 'email';
        const label  = $(e.currentTarget).text().trim();
        const clicks = this.data.ctaClicks || [];
        clicks.push({ type, label, time: new Date().toISOString() });
        this.update('ctaClicks', clicks);
        // Adjunta resultado de calculadora al hacer click en CTA
        this.update('calcResult', Calculator.getResult());
      });
    },

    /**
     * Exporta los datos capturados listos para enviar a un webhook / CRM.
     * Uso: LeadCapture.export() desde consola o desde un botón de admin.
     */
    export() {
      return JSON.parse(JSON.stringify(this.data));
    },
  };

  /* ─────────────────────────────────────────────
   * 3. ANIMATIONS
   * Intersection Observer — entradas al scroll con clase CSS
   * ───────────────────────────────────────────── */
  const Animations = {
    init() {
      if (!('IntersectionObserver' in window)) {
        // Fallback: muestra todo si no hay soporte
        $('[data-animate]').addClass(CONFIG.animationClass);
        return;
      }

      // Marca elementos animables en el DOM
      const targets = [
        '.service-row',
        '.process-cell',
        '.number-cell',
        '.pain-check',
        '.price-card',
        '.pricing-table tr',
      ].join(', ');

      $(targets).attr('data-animate', '');

      const observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              $(entry.target).addClass(CONFIG.animationClass);
              observer.unobserve(entry.target); // solo una vez
            }
          });
        },
        { threshold: 0.12, rootMargin: '0px 0px -40px 0px' }
      );

      $('[data-animate]').each((_, el) => observer.observe(el));
    },
  };

  /* ─────────────────────────────────────────────
   * 4. FLOAT CTA
   * Aparece después de hacer scroll y se oculta cerca del footer
   * ───────────────────────────────────────────── */
  const FloatCTA = {
    init() {
      const $btn    = $('.float-cta');
      if (!$btn.length) return;

      $btn.css('opacity', '0').css('pointer-events', 'none');

      $(window).on('scroll.floatcta', Utils.throttle(() => {
        const scrolled   = $(window).scrollTop();
        const docHeight  = $(document).height();
        const winHeight  = $(window).height();
        const nearBottom = scrolled + winHeight > docHeight - 200;

        if (scrolled > 400 && !nearBottom) {
          $btn.css({ opacity: '1', 'pointer-events': 'auto' });
        } else {
          $btn.css({ opacity: '0', 'pointer-events': 'none' });
        }
      }, 100));
    },
  };

  /* ─────────────────────────────────────────────
   * 5. NAV SCROLL
   * Resalta el link activo según la sección visible
   * ───────────────────────────────────────────── */
  const NavScroll = {
    sections: [],

    init() {
      this.sections = $('section[id], div[id]')
        .filter((_, el) => $(el).attr('id'))
        .toArray();

      $(window).on('scroll.nav', Utils.throttle(() => this.update(), 120));
    },

    update() {
      const scrollTop = $(window).scrollTop() + 80;
      let current = '';

      this.sections.forEach((el) => {
        if ($(el).offset().top <= scrollTop) {
          current = $(el).attr('id');
        }
      });

      $('.nav-links a').each((_, a) => {
        const href = $(a).attr('href')?.replace('#', '');
        $(a).toggleClass('nav-active', href === current);
      });
    },
  };

  /* ─────────────────────────────────────────────
   * 6. UTILS
   * Helpers reutilizables
   * ───────────────────────────────────────────── */
  const Utils = {
    throttle(fn, delay) {
      let last = 0;
      return function (...args) {
        const now = Date.now();
        if (now - last >= delay) {
          last = now;
          fn.apply(this, args);
        }
      };
    },

    formatCLP(value) {
      return '$' + Math.round(value).toLocaleString('es-CL');
    },
  };

  /* ─────────────────────────────────────────────
   * INIT — arranca todo cuando el DOM está listo
   * ───────────────────────────────────────────── */
  $(document).ready(() => {
    LeadCapture.init();
    Calculator.init();
    Animations.init();
    FloatCTA.init();
    NavScroll.init();

    // Expone LeadCapture globalmente para debugging / integración futura
    window.bld = { LeadCapture, Calculator };
  });

})(jQuery);
