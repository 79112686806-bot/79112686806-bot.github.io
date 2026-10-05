// Блоки главной: видео (Rutube / VK Видео) и отзывы. Общий шаблон для сайта,
// админ-панели и сборки (готовый HTML для поисковиков).
(function (root) {
  const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

  // Ссылка на ролик → адрес плеера для встраивания. Поддерживаются Rutube и VK Видео.
  function embedUrl(u) {
    let x;
    try { x = new URL(u); } catch (e) { return null; }
    if (x.protocol !== 'https:') return null;
    const h = x.hostname.replace(/^www\./, '').replace(/^m\./, '');
    let m;
    if (h === 'rutube.ru') {
      m = x.pathname.match(/^\/(?:video|play\/embed|shorts)\/([0-9a-f]{32})/);
      return m ? 'https://rutube.ru/play/embed/' + m[1] : null;
    }
    if (h === 'vk.com' || h === 'vkvideo.ru' || h === 'vk.ru') {
      if (x.pathname === '/video_ext.php' && x.searchParams.get('oid') && x.searchParams.get('id')) {
        return `https://vk.com/video_ext.php?oid=${encodeURIComponent(x.searchParams.get('oid'))}&id=${encodeURIComponent(x.searchParams.get('id'))}&hd=2`;
      }
      m = (x.pathname + x.search).match(/video(-?\d+)_(\d+)/);
      return m ? `https://vk.com/video_ext.php?oid=${m[1]}&id=${m[2]}&hd=2` : null;
    }
    return null;
  }

  // Заставка с кнопкой ▶ — плеер загружается только по нажатию (не тормозит страницу)
  function videosHtml(list) {
    return (list || []).map((v) => {
      const e = embedUrl(v.url);
      if (!e) return '';
      return `<figure class="video-card"><div class="video-frame"><button type="button" data-embed="${esc(e)}" onclick="playVideo(this)" aria-label="Смотреть видео: ${esc(v.title)}">` +
        `${v.thumbnail_url ? `<img src="${esc(v.thumbnail_url)}" alt="" loading="lazy" decoding="async">` : ''}<span class="video-play" aria-hidden="true">▶</span></button></div>` +
        `<figcaption><h3>${esc(v.title)}</h3>${v.description ? `<p>${esc(v.description)}</p>` : ''}</figcaption></figure>`;
    }).join('');
  }

  function reviewsHtml(list) {
    return (list || []).map((r) => {
      const course = r.course_title || (r.courses && r.courses.title);
      return `<figure class="review"><blockquote>${esc(r.text)}</blockquote><figcaption>${esc(r.author_name)}` +
        `<small>${r.author_role === 'student' ? 'ученик' : 'родитель'}${course ? ` · курс «${esc(course)}»` : ''}</small></figcaption></figure>`;
    }).join('');
  }

  root.HomeBlocks = { embedUrl, videosHtml, reviewsHtml };
})(typeof window !== 'undefined' ? window : globalThis);
