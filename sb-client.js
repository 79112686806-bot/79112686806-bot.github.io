// Клиент Supabase для сайта и админки, с настройками под телефоны:
// - вход хранится в localStorage, а если он недоступен (приватный режим, встроенный браузер) — в памяти вкладки;
// - без межвкладочной блокировки navigator.locks: на iOS и во встроенных браузерах она зависала,
//   и войти получалось только после очистки данных сайта;
// - у запросов есть предельное время ожидания, при обрыве связи внизу появляется подсказка;
// - токен обновляется, только пока вкладка открыта, и сразу при возвращении к ней.
(function () {
  function safeStorage() {
    const mem = {};
    let ls = null;
    try { ls = window.localStorage; const k = '__sb_test'; ls.setItem(k, '1'); ls.removeItem(k); } catch (e) { ls = null; }
    return {
      getItem: (k) => { try { return ls ? ls.getItem(k) : (k in mem ? mem[k] : null); } catch (e) { return k in mem ? mem[k] : null; } },
      setItem: (k, v) => { mem[k] = v; try { ls && ls.setItem(k, v); } catch (e) {} },
      removeItem: (k) => { delete mem[k]; try { ls && ls.removeItem(k); } catch (e) {} },
    };
  }

  // очередь внутри вкладки вместо navigator.locks
  const queues = {};
  function lock(name, _timeout, fn) {
    const prev = queues[name] || Promise.resolve();
    const run = prev.catch(() => {}).then(() => fn());
    queues[name] = run.catch(() => {});
    return run;
  }

  // подсказка «нет связи»: показывается при сетевой ошибке, прячется после первого удачного запроса
  let toast = null;
  function netToast(on) {
    if (!on) { if (toast) toast.hidden = true; return; }
    if (!toast) {
      toast = document.createElement('div'); toast.className = 'net-toast'; toast.setAttribute('role', 'status');
      toast.innerHTML = '<span>Нет связи с сервером. Проверьте интернет — или переключитесь между Wi‑Fi и мобильной сетью.</span><button type="button">Обновить</button>';
      toast.querySelector('button').onclick = () => location.reload();
      document.body.append(toast);
    }
    toast.hidden = false;
  }

  function timedFetch(input, init = {}) {
    const method = (init.method || 'GET').toUpperCase();
    const limit = method === 'GET' || method === 'HEAD' ? 25000 : 90000;   // загрузка файлов в админке идёт дольше
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), limit);
    if (init.signal) { if (init.signal.aborted) ctrl.abort(); else init.signal.addEventListener('abort', () => ctrl.abort()); }
    return fetch(input, { ...init, signal: ctrl.signal })
      .then((r) => { netToast(false); return r; })
      .catch((e) => { if (!init.signal || !init.signal.aborted) netToast(true); throw e; })
      .finally(() => clearTimeout(timer));
  }

  window.makeSupabase = function () {
    const cfg = window.APP_CONFIG;
    const client = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseKey, {
      auth: { storage: safeStorage(), lock, persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
      global: { fetch: timedFetch },
    });
    // вкладка в фоне — таймеры на телефоне засыпают; обновляем токен при возвращении
    const onVis = () => {
      if (document.visibilityState === 'visible') { client.auth.startAutoRefresh(); client.auth.getSession().catch(() => {}); }
      else client.auth.stopAutoRefresh();
    };
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('pageshow', (e) => { if (e.persisted) onVis(); });   // возврат «назад» из кэша Safari
    return client;
  };
})();
