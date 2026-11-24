/**
 * Malala Store - Módulo Centralizado de Rastreamento e Conversões
 * Suporta: Meta Pixel (Facebook/Instagram Ads), Google Tag Manager (GTM),
 * Google Analytics 4 (GA4) e TikTok Pixel.
 *
 * As configurações podem ser preenchidas direto no Painel Admin (aba "Marketing & Tráfego")
 * ou manualmente em MALALA_TRACKING_CONFIG abaixo como fallback estático.
 */
(function () {
  'use strict';

  // =========================================================================
  // 1. CONFIGURAÇÃO ESTÁTICA (FALLBACK — SOBRESCRITA PELO PAINEL ADMIN)
  // =========================================================================
  const DEFAULT_CONFIG = {
    metaPixelId: '',   // Ex: '123456789012345'
    gtmId: '',         // Ex: 'GTM-XXXXXXX'
    ga4Id: '',         // Ex: 'G-XXXXXXXXXX' (deixe vazio se o GA4 já for disparado via GTM)
    tiktokPixelId: '', // Ex: 'CXXXXXXXXXXXXXXXXX'
    debug: false       // true = exibe log detalhado dos eventos no console do navegador
  };

  const STORAGE_KEYS = {
    marketingConfig: 'malala_marketing_config',
    pendingOrders: 'malala_pending_orders',
    trackedPurchases: 'malala_tracked_purchases'
  };

  const initializedProviders = {
    metaPixelId: '',
    gtmId: '',
    ga4Id: '',
    tiktokPixelId: ''
  };

  window.dataLayer = window.dataLayer || [];

  function readStorageJson(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
      return fallback;
    }
  }

  function writeStorageJson(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
      // Ignora erro de quota ou modo privado restrito
    }
  }

  const cachedConfig = readStorageJson(STORAGE_KEYS.marketingConfig, {});
  window.MALALA_TRACKING_CONFIG = {
    ...DEFAULT_CONFIG,
    ...(cachedConfig && typeof cachedConfig === 'object' ? cachedConfig : {})
  };

  function logDebug(label, payload) {
    if (window.MALALA_TRACKING_CONFIG.debug && typeof console !== 'undefined') {
      console.log(`[MalalaTracking] ${label}`, payload || '');
    }
  }

  // =========================================================================
  // 2. INICIALIZAÇÃO IDEMPOTENTE DOS SCRIPTS (PAGEVIEW AUTOMÁTICO)
  // =========================================================================
  function initProviders() {
    const config = window.MALALA_TRACKING_CONFIG;

    // --- Google Tag Manager (GTM) ---
    const gtmId = String(config.gtmId || '').trim();
    if (gtmId && initializedProviders.gtmId !== gtmId) {
      initializedProviders.gtmId = gtmId;
      window.dataLayer.push({ 'gtm.start': new Date().getTime(), event: 'gtm.js' });
      const firstScript = document.getElementsByTagName('script')[0];
      const gtmScript = document.createElement('script');
      gtmScript.async = true;
      gtmScript.src = 'https://www.googletagmanager.com/gtm.js?id=' + encodeURIComponent(gtmId);
      if (firstScript && firstScript.parentNode) {
        firstScript.parentNode.insertBefore(gtmScript, firstScript);
      } else if (document.head) {
        document.head.appendChild(gtmScript);
      }
      logDebug('GTM inicializado', { gtmId });
    }

    // --- Google Analytics 4 direto (gtag.js) ---
    const ga4Id = String(config.ga4Id || '').trim();
    if (ga4Id && initializedProviders.ga4Id !== ga4Id) {
      initializedProviders.ga4Id = ga4Id;
      const gtagScript = document.createElement('script');
      gtagScript.async = true;
      gtagScript.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(ga4Id);
      if (document.head) document.head.appendChild(gtagScript);

      window.gtag = window.gtag || function () {
        window.dataLayer.push(arguments);
      };
      window.gtag('js', new Date());
      window.gtag('config', ga4Id);
      logDebug('GA4 (gtag) inicializado', { ga4Id });
    }

    // --- Meta Pixel (Facebook / Instagram Ads) ---
    const pixelId = String(config.metaPixelId || '').trim();
    if (pixelId && initializedProviders.metaPixelId !== pixelId) {
      initializedProviders.metaPixelId = pixelId;
      if (!window.fbq) {
        const n = (window.fbq = function () {
          n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments);
        });
        if (!window._fbq) window._fbq = n;
        n.push = n;
        n.loaded = true;
        n.version = '2.0';
        n.queue = [];
        const pixelScript = document.createElement('script');
        pixelScript.async = true;
        pixelScript.src = 'https://connect.facebook.net/en_US/fbevents.js';
        const firstScript = document.getElementsByTagName('script')[0];
        if (firstScript && firstScript.parentNode) {
          firstScript.parentNode.insertBefore(pixelScript, firstScript);
        } else if (document.head) {
          document.head.appendChild(pixelScript);
        }
      }
      window.fbq('init', pixelId);
      window.fbq('track', 'PageView');
      logDebug('Meta Pixel inicializado + PageView disparado', { pixelId });
    }

    // --- TikTok Pixel ---
    const tiktokId = String(config.tiktokPixelId || '').trim();
    if (tiktokId && initializedProviders.tiktokPixelId !== tiktokId) {
      initializedProviders.tiktokPixelId = tiktokId;
      if (!window.ttq) {
        window.TiktokAnalyticsObject = 'ttq';
        const ttq = (window.ttq = window.ttq || []);
        ttq.methods = ['page', 'track', 'identify', 'instances', 'debug', 'on', 'off', 'once', 'ready', 'alias', 'group', 'enableCookie', 'disableCookie'];
        ttq.setAndDefer = function (t, e) {
          t[e] = function () {
            t.push([e].concat(Array.prototype.slice.call(arguments, 0)));
          };
        };
        for (let i = 0; i < ttq.methods.length; i++) {
          ttq.setAndDefer(ttq, ttq.methods[i]);
        }
        ttq.load = function (e) {
          const s = document.createElement('script');
          s.type = 'text/javascript';
          s.async = true;
          s.src = 'https://analytics.tiktok.com/i18n/pixel/events.js?sdkid=' + encodeURIComponent(e) + '&lib=ttq';
          const firstScript = document.getElementsByTagName('script')[0];
          if (firstScript && firstScript.parentNode) {
            firstScript.parentNode.insertBefore(s, firstScript);
          } else if (document.head) {
            document.head.appendChild(s);
          }
        };
      }
      window.ttq.load(tiktokId);
      window.ttq.page();
      logDebug('TikTok Pixel inicializado + PageView disparado', { tiktokId });
    }
  }

  // Inicializa imediatamente com config estática ou em cache
  initProviders();

  // =========================================================================
  // 3. HELPERS DE FORMATAÇÃO E DEDUPLICAÇÃO
  // =========================================================================
  function toNumber(value) {
    const num = Number(value);
    return Number.isFinite(num) ? Number(num.toFixed(2)) : 0;
  }

  function normalizeItems(rawItems) {
    if (!Array.isArray(rawItems)) return [];
    return rawItems
      .filter(Boolean)
      .map((item) => {
        const qty = Math.max(1, parseInt(item.quantity ?? item.qty ?? 1, 10) || 1);
        const price = toNumber(item.price ?? item.unit_price ?? 0);
        return {
          id: String(item.id ?? ''),
          title: String(item.title ?? item.name ?? 'Produto'),
          category: String(item.category ?? item.subcategory ?? ''),
          price,
          quantity: qty
        };
      })
      .filter((item) => item.id !== '');
  }

  function buildMetaPayload(items, overrideValue) {
    const normalized = normalizeItems(items);
    const totalValue =
      overrideValue !== undefined && overrideValue !== null
        ? toNumber(overrideValue)
        : toNumber(normalized.reduce((acc, i) => acc + i.price * i.quantity, 0));
    const totalQty = normalized.reduce((acc, i) => acc + i.quantity, 0);

    return {
      content_ids: normalized.map((i) => i.id),
      contents: normalized.map((i) => ({
        id: i.id,
        quantity: i.quantity,
        item_price: i.price
      })),
      content_type: 'product',
      num_items: totalQty,
      value: totalValue,
      currency: 'BRL'
    };
  }

  function buildGa4Items(items) {
    return normalizeItems(items).map((i) => ({
      item_id: i.id,
      item_name: i.title,
      item_category: i.category || undefined,
      price: i.price,
      quantity: i.quantity
    }));
  }

  function dispatchMeta(eventName, params, options) {
    const config = window.MALALA_TRACKING_CONFIG;
    if (typeof window.fbq === 'function' && String(config.metaPixelId || '').trim()) {
      if (options) {
        window.fbq('track', eventName, params, options);
      } else {
        window.fbq('track', eventName, params);
      }
    }
    logDebug(`Meta Pixel -> ${eventName}`, options ? { params, options } : params);
  }

  function dispatchTikTok(eventName, params) {
    const config = window.MALALA_TRACKING_CONFIG;
    if (window.ttq && typeof window.ttq.track === 'function' && String(config.tiktokPixelId || '').trim()) {
      window.ttq.track(eventName, params);
      logDebug(`TikTok Pixel -> ${eventName}`, params);
    }
  }

  function dispatchGa4(eventName, ecommercePayload) {
    const config = window.MALALA_TRACKING_CONFIG;
    window.dataLayer.push({ ecommerce: null });
    window.dataLayer.push({
      event: eventName,
      ecommerce: ecommercePayload
    });

    if (typeof window.gtag === 'function' && String(config.ga4Id || '').trim() && !String(config.gtmId || '').trim()) {
      window.gtag('event', eventName, ecommercePayload);
    }

    logDebug(`GA4/dataLayer -> ${eventName}`, ecommercePayload);
  }

  function isPurchaseTracked(orderId) {
    if (!orderId) return false;
    const tracked = readStorageJson(STORAGE_KEYS.trackedPurchases, []);
    return Array.isArray(tracked) && tracked.includes(String(orderId));
  }

  function markPurchaseTracked(orderId) {
    if (!orderId) return;
    const tracked = readStorageJson(STORAGE_KEYS.trackedPurchases, []);
    const list = Array.isArray(tracked) ? tracked : [];
    const idStr = String(orderId);
    if (!list.includes(idStr)) {
      list.push(idStr);
      writeStorageJson(STORAGE_KEYS.trackedPurchases, list.slice(-50));
    }
  }

  // =========================================================================
  // 4. API PÚBLICA DE EVENTOS DE E-COMMERCE
  // =========================================================================
  window.MalalaTracking = {
    configure(remoteConfig) {
      if (!remoteConfig || typeof remoteConfig !== 'object') return;
      const merged = {
        ...DEFAULT_CONFIG,
        metaPixelId: String(remoteConfig.metaPixelId || DEFAULT_CONFIG.metaPixelId || '').trim(),
        gtmId: String(remoteConfig.gtmId || DEFAULT_CONFIG.gtmId || '').trim(),
        ga4Id: String(remoteConfig.ga4Id || DEFAULT_CONFIG.ga4Id || '').trim(),
        tiktokPixelId: String(remoteConfig.tiktokPixelId || DEFAULT_CONFIG.tiktokPixelId || '').trim(),
        debug: Boolean(remoteConfig.debug)
      };
      window.MALALA_TRACKING_CONFIG = merged;
      writeStorageJson(STORAGE_KEYS.marketingConfig, merged);
      initProviders();
      logDebug('Configuração sincronizada do Painel Admin', merged);
    },

    viewContent(product) {
      if (!product) return;
      const items = normalizeItems([{ ...product, quantity: 1 }]);
      if (!items.length) return;
      const item = items[0];

      dispatchMeta('ViewContent', {
        content_ids: [item.id],
        content_name: item.title,
        content_category: item.category,
        content_type: 'product',
        value: item.price,
        currency: 'BRL'
      });

      dispatchTikTok('ViewContent', {
        content_id: item.id,
        content_name: item.title,
        content_type: 'product',
        value: item.price,
        currency: 'BRL'
      });

      dispatchGa4('view_item', {
        currency: 'BRL',
        value: item.price,
        items: buildGa4Items(items)
      });
    },

    addToCart(product, quantity = 1) {
      if (!product) return;
      const items = normalizeItems([{ ...product, quantity }]);
      if (!items.length) return;
      const item = items[0];
      const total = toNumber(item.price * item.quantity);

      dispatchMeta('AddToCart', {
        content_ids: [item.id],
        content_name: item.title,
        content_category: item.category,
        content_type: 'product',
        contents: [{ id: item.id, quantity: item.quantity, item_price: item.price }],
        num_items: item.quantity,
        value: total,
        currency: 'BRL'
      });

      dispatchTikTok('AddToCart', {
        content_id: item.id,
        content_name: item.title,
        content_type: 'product',
        quantity: item.quantity,
        value: total,
        currency: 'BRL'
      });

      dispatchGa4('add_to_cart', {
        currency: 'BRL',
        value: total,
        items: buildGa4Items(items)
      });
    },

    initiateCheckout(cartItems, channel = 'mercadopago') {
      const items = normalizeItems(cartItems);
      if (!items.length) return;
      const metaPayload = buildMetaPayload(items);

      dispatchMeta('InitiateCheckout', metaPayload);
      dispatchTikTok('InitiateCheckout', {
        contents: metaPayload.contents.map((c) => ({ content_id: c.id, quantity: c.quantity, price: c.item_price })),
        value: metaPayload.value,
        currency: 'BRL'
      });
      dispatchGa4('begin_checkout', {
        currency: 'BRL',
        value: metaPayload.value,
        checkout_channel: channel,
        items: buildGa4Items(items)
      });
    },

    addPaymentInfo(cartItems, paymentMethod) {
      const items = normalizeItems(cartItems);
      if (!items.length) return;
      const metaPayload = buildMetaPayload(items);

      dispatchMeta('AddPaymentInfo', metaPayload);
      dispatchTikTok('AddPaymentInfo', {
        value: metaPayload.value,
        currency: 'BRL'
      });
      dispatchGa4('add_payment_info', {
        currency: 'BRL',
        value: metaPayload.value,
        payment_type: paymentMethod || 'unknown',
        items: buildGa4Items(items)
      });
    },

    savePendingOrder(order) {
      if (!order || !order.orderId) return;
      const items = normalizeItems(order.items);
      const total =
        order.value !== undefined && order.value !== null
          ? toNumber(order.value)
          : toNumber(items.reduce((acc, i) => acc + i.price * i.quantity, 0));

      const map = readStorageJson(STORAGE_KEYS.pendingOrders, {});
      map[String(order.orderId)] = {
        orderId: String(order.orderId),
        value: total,
        items,
        paymentMethod: order.paymentMethod || 'mercadopago',
        savedAt: Date.now()
      };

      const keys = Object.keys(map);
      if (keys.length > 20) {
        keys
          .sort((a, b) => (map[a].savedAt || 0) - (map[b].savedAt || 0))
          .slice(0, keys.length - 20)
          .forEach((k) => delete map[k]);
      }

      writeStorageJson(STORAGE_KEYS.pendingOrders, map);
      logDebug('Pedido pendente salvo para rastreamento de Purchase', map[String(order.orderId)]);
    },

    getPendingOrder(orderId) {
      if (!orderId) return null;
      const map = readStorageJson(STORAGE_KEYS.pendingOrders, {});
      return map[String(orderId)] || null;
    },

    removePendingOrder(orderId) {
      if (!orderId) return;
      const map = readStorageJson(STORAGE_KEYS.pendingOrders, {});
      if (map[String(orderId)]) {
        delete map[String(orderId)];
        writeStorageJson(STORAGE_KEYS.pendingOrders, map);
      }
    },

    purchase(orderInput) {
      if (!orderInput) return false;

      const orderId =
        typeof orderInput === 'string'
          ? orderInput
          : String(orderInput.orderId || orderInput.id || '');

      if (orderId && isPurchaseTracked(orderId)) {
        logDebug('Purchase ignorado (já contabilizado para este pedido)', { orderId });
        return false;
      }

      const pending = orderId ? this.getPendingOrder(orderId) : null;
      const rawItems =
        (typeof orderInput === 'object' && orderInput.items && orderInput.items.length
          ? orderInput.items
          : pending && pending.items) || [];
      const items = normalizeItems(rawItems);

      const computedValue = items.reduce((acc, i) => acc + i.price * i.quantity, 0);
      const rawValue =
        typeof orderInput === 'object' && orderInput.value !== undefined && orderInput.value !== null
          ? orderInput.value
          : typeof orderInput === 'object' && orderInput.totalAmount !== undefined
            ? orderInput.totalAmount
            : pending && pending.value !== undefined
              ? pending.value
              : computedValue;

      const value = toNumber(rawValue);
      const paymentMethod =
        (typeof orderInput === 'object' && orderInput.paymentMethod) ||
        (pending && pending.paymentMethod) ||
        'mercadopago';

      const transactionId = orderId || `ORD-${Date.now()}`;
      const metaPayload = buildMetaPayload(items, value);

      dispatchMeta('Purchase', metaPayload, { eventID: transactionId });
      dispatchTikTok('CompletePayment', {
        contents: metaPayload.contents.map((c) => ({ content_id: c.id, quantity: c.quantity, price: c.item_price })),
        value,
        currency: 'BRL'
      });
      dispatchGa4('purchase', {
        transaction_id: transactionId,
        currency: 'BRL',
        value,
        payment_type: paymentMethod,
        items: buildGa4Items(items)
      });

      if (orderId) {
        markPurchaseTracked(orderId);
        this.removePendingOrder(orderId);
      }

      return true;
    },

    async trackMercadoPagoReturn({ orderId, status, backendUrl }) {
      const normalizedStatus = String(status || '').toLowerCase();
      if (normalizedStatus !== 'approved' && normalizedStatus !== 'pago') {
        return false;
      }

      if (orderId && isPurchaseTracked(orderId)) {
        logDebug('Retorno Mercado Pago já rastreado anteriormente', { orderId });
        return false;
      }

      let orderData = orderId ? this.getPendingOrder(orderId) : null;

      if (!orderData && orderId && backendUrl) {
        try {
          const res = await fetch(`${backendUrl}/api/orders/${encodeURIComponent(orderId)}/status`);
          if (res.ok) {
            const remote = await res.json();
            if (remote && (remote.status === 'Pago' || normalizedStatus === 'approved')) {
              orderData = {
                orderId,
                value: remote.totalAmount,
                items: remote.items || [],
                paymentMethod: remote.paymentMethod || 'mercado_pago_pro'
              };
            }
          }
        } catch (err) {
          logDebug('Fallback remoto de Purchase indisponível', err);
        }
      }

      return this.purchase(
        orderData || {
          orderId,
          value: 0,
          items: [],
          paymentMethod: 'mercado_pago_pro'
        }
      );
    },

    getMetaBrowserData() {
      function readCookie(name) {
        try {
          const match = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
          return match ? decodeURIComponent(match[1]) : '';
        } catch (e) {
          return '';
        }
      }
      return {
        fbp: readCookie('_fbp'),
        fbc: readCookie('_fbc'),
        eventSourceUrl: window.location.href
      };
    },

    contact(source, details = {}) {
      dispatchMeta('Contact', {
        content_name: source || 'whatsapp',
        ...details
      });
      dispatchTikTok('Contact', {
        content_name: source || 'whatsapp'
      });
      window.dataLayer.push({
        event: 'contact',
        contact_source: source || 'whatsapp',
        ...details
      });
      const config = window.MALALA_TRACKING_CONFIG;
      if (typeof window.gtag === 'function' && String(config.ga4Id || '').trim() && !String(config.gtmId || '').trim()) {
        window.gtag('event', 'contact', {
          contact_source: source || 'whatsapp',
          ...details
        });
      }
      logDebug('Contact disparado', { source, details });
    }
  };
})();
