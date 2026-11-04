/*
 * Leitor generico de cronogramas da fase escolar em PDF.
 *
 * Funciona pela POSICAO dos textos de cada pagina (extraidos com pdf.js), sem depender
 * de um modelo fixo:
 *  - localiza os cabecalhos de mes ("Novembro", "Novembro/2026", "NOV 2026"...);
 *  - localiza os numeros dos dias (1..31) abaixo de cada mes, aceitando grades semanais
 *    (Dom..Sab) ou linhas do tempo (1, 2, 3 ... 31) e paginas com texto girado;
 *  - atribui cada texto ao dia cujo numero esta acima dele, na mesma coluna;
 *  - classifica o dia: aula (sigla de disciplina, atividade...), feriado ou sem aula.
 *
 * Tambem identifica, quando existir: carga horaria total, aulas por dia, tempo da aula,
 * turno, horario, curso e turma.
 *
 * Uso: SchoolPdfParser.parse(pages) onde pages = [{ items: [{ str, transform, width }] }]
 * (o mesmo formato de page.getTextContent() do pdf.js).
 */
(function (root) {
  const MONTHS = {
    janeiro: 0, fevereiro: 1, marco: 2, abril: 3, maio: 4, junho: 5,
    julho: 6, agosto: 7, setembro: 8, outubro: 9, novembro: 10, dezembro: 11,
  };
  const MONTH_LABELS = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
  const MONTH_ABBR = {
    jan: 0, fev: 1, mar: 2, abr: 3, mai: 4, jun: 5, jul: 6, ago: 7, set: 8, out: 9, nov: 10, dez: 11,
  };
  const WEEKDAY_WORDS = {
    dom: 0, domingo: 0,
    seg: 1, segunda: 1, 'segunda-feira': 1, '2a': 1,
    ter: 2, terca: 2, 'terca-feira': 2, '3a': 2,
    qua: 3, quarta: 3, 'quarta-feira': 3, '4a': 3,
    qui: 4, quinta: 4, 'quinta-feira': 4, '5a': 4,
    sex: 5, sexta: 5, 'sexta-feira': 5, '6a': 5,
    sab: 6, sabado: 6,
  };
  const HOLIDAY_RE = /feriado/;
  const OFF_RE = /sem aula|recesso|nao letivo|n\.? letivo|ferias|ponto facultativo|emenda|suspens|sem expediente|folga|sem atividade|reposicao? nao/;
  const IGNORE_RE = /^[-–—_.,;:|/\\*]+$/;

  function norm(value) {
    return String(value || '')
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim();
  }

  function weekdayOf(str) {
    const n = norm(str).replace(/\.$/, '');
    return Object.prototype.hasOwnProperty.call(WEEKDAY_WORDS, n) ? WEEKDAY_WORDS[n] : null;
  }

  function parseMonthHeader(str) {
    const n = norm(str);
    let m = n.match(/^(janeiro|fevereiro|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)(?:\s*(?:\/|-|de)?\s*(\d{2,4}))?$/);
    if (m) return { month: MONTHS[m[1]], year: normalizeYear(m[2]) };
    m = n.match(/^(jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)\.?\s*(?:\/|-|de)?\s*(\d{2,4})$/);
    if (m) return { month: MONTH_ABBR[m[1]], year: normalizeYear(m[2]) };
    return null;
  }

  function normalizeYear(raw) {
    if (!raw) return null;
    const value = Number(raw);
    if (raw.length === 2) return 2000 + value;
    return value >= 2000 && value <= 2100 ? value : null;
  }

  function parseYearItem(str) {
    const m = norm(str).match(/^(?:ano\s*:?\s*)?(20\d{2})$/);
    return m ? Number(m[1]) : null;
  }

  function parseDayItem(str) {
    const n = norm(str);
    let m = n.match(/^(\d{1,2})(?:\s*[-/]?\s*(dom|seg|ter|qua|qui|sex|sab)[a-z-]*\.?)?$/);
    if (m) {
      const day = Number(m[1]);
      if (day >= 1 && day <= 31) return { day, weekday: m[2] ? WEEKDAY_WORDS[m[2]] : null };
    }
    m = n.match(/^(dom|seg|ter|qua|qui|sex|sab)[a-z-]*\.?\s*[-,]?\s*(\d{1,2})$/);
    if (m) {
      const day = Number(m[2]);
      if (day >= 1 && day <= 31) return { day, weekday: WEEKDAY_WORDS[m[1]] };
    }
    return null;
  }

  function median(values) {
    if (!values.length) return null;
    const sorted = values.slice().sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  }

  // Converte os itens do pdf.js para coordenadas "de leitura" (x para a direita, y para baixo),
  // corrigindo paginas cujo texto esta girado.
  function normalizeItems(rawItems) {
    const items = rawItems
      .filter((it) => it && typeof it.str === 'string' && it.str.trim() && Array.isArray(it.transform))
      .map((it) => {
        const [a, b, , , e, f] = it.transform;
        const angle = Math.round((Math.atan2(b, a) * 180) / Math.PI / 90) * 90;
        return { str: it.str.trim(), e, f, w: it.width || 0, angle };
      });
    const counts = {};
    items.forEach((it) => { counts[it.angle] = (counts[it.angle] || 0) + 1; });
    const dominant = Number(Object.keys(counts).sort((p, q) => counts[q] - counts[p])[0] || 0);
    const rad = (dominant * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    return items.map((it) => {
      const x = it.e * cos + it.f * sin;
      const yUp = -it.e * sin + it.f * cos;
      return { str: it.str, x, y: -yUp, w: it.w, cx: x + it.w / 2 };
    });
  }

  function parsePage(rawItems, pageIndex) {
    const items = normalizeItems(rawItems);
    items.forEach((it) => { it.page = pageIndex; });

    const headers = [];
    const yearItems = [];
    items.forEach((it) => {
      const header = parseMonthHeader(it.str);
      if (header) {
        it.kind = 'month';
        headers.push({ ...header, x: it.x, cx: it.cx, y: it.y, page: pageIndex, item: it });
        return;
      }
      const year = parseYearItem(it.str);
      if (year) {
        it.kind = 'year';
        yearItems.push({ year, x: it.x, y: it.y });
      }
    });
    // Rotulo "Ano:" seguido de numero em item separado
    items.forEach((it) => {
      if (/^ano\s*:?$/.test(norm(it.str))) {
        const next = items
          .filter((o) => o !== it && Math.abs(o.y - it.y) < 4 && o.x > it.x && /^20\d{2}$/.test(o.str))
          .sort((p, q) => p.x - q.x)[0];
        if (next && !yearItems.some((yi) => yi.y === next.y && yi.x === next.x)) yearItems.push({ year: Number(next.str), x: next.x, y: next.y });
      }
    });

    if (!headers.length) return { headers: [], items, yearItems };

    // Faixa horizontal de cada cabecalho: metade da distancia ate os vizinhos da mesma linha
    headers.forEach((h) => {
      const sameRow = headers.filter((o) => Math.abs(o.y - h.y) < 8).sort((p, q) => p.cx - q.cx);
      const idx = sameRow.indexOf(h);
      h.left = idx > 0 ? (sameRow[idx - 1].cx + h.cx) / 2 : -Infinity;
      h.right = idx < sameRow.length - 1 ? (h.cx + sameRow[idx + 1].cx) / 2 : Infinity;
    });

    const ownerOf = (it) => {
      let best = null;
      headers.forEach((h) => {
        if (h.y < it.y - 0.5 && it.cx >= h.left && it.cx < h.right) {
          if (!best || h.y > best.y) best = h;
        }
      });
      return best;
    };

    items.forEach((it) => {
      if (it.kind === 'month') return;
      const owner = ownerOf(it);
      if (owner) {
        it.owner = owner;
        (owner.members || (owner.members = [])).push(it);
      }
    });

    headers.forEach((h) => buildMonthGrid(h));
    const pageBottom = items.reduce((max, it) => Math.max(max, it.y), 0) + 10;
    return { headers, items, yearItems, pageBottom };
  }

  // Layout "linha do tempo": uma fileira longa de dias da semana (dom seg ter ... ) com os
  // numeros dos dias logo acima/abaixo. Usa a fileira como referencia e corrige numeros
  // faltantes ou mal lidos (comum em PDF digitalizado).
  function buildTimelineAnchors(header, members, candidates) {
    const weekdayItems = members.filter((it) => weekdayOf(it.str) !== null);
    const rows = [];
    weekdayItems.sort((p, q) => p.y - q.y || p.cx - q.cx).forEach((w) => {
      const row = rows.find((r) => Math.abs(r.y - w.y) < 3);
      if (row) row.items.push(w); else rows.push({ y: w.y, items: [w] });
    });
    const longRows = rows.filter((r) => r.items.length >= 8).sort((p, q) => p.y - q.y);
    if (!longRows.length) return null;

    const anchors = [];
    let lastDay = 0;
    let offset = 0;
    longRows.forEach((row) => {
      const items = row.items.sort((p, q) => p.cx - q.cx);
      const gaps = [];
      for (let i = 1; i < items.length; i += 1) gaps.push(items[i].cx - items[i - 1].cx);
      const gap = median(gaps) || 20;
      // colunas, inserindo posicoes onde um rotulo nao foi lido
      const cols = [];
      items.forEach((it, i) => {
        if (i > 0) {
          const missing = Math.round((it.cx - items[i - 1].cx) / gap) - 1;
          for (let k = 1; k <= missing && k < 4; k += 1) {
            const prevWd = weekdayOf(items[i - 1].str);
            cols.push({ cx: items[i - 1].cx + gap * k, y: row.y, weekday: (prevWd + k) % 7, virtual: true });
          }
        }
        cols.push({ cx: it.cx, y: it.y, weekday: weekdayOf(it.str), item: it });
      });
      const tol = gap * 0.5;
      const shifts = {};
      cols.forEach((c, i) => {
        const num = candidates.find((n) => Math.abs(n.cx - c.cx) <= tol && n.y >= c.y - gap * 1.2 && n.y <= c.y + 4);
        if (num) {
          c.num = num;
          const s = num.day - i;
          shifts[s] = (shifts[s] || 0) + 1;
        }
      });
      const best = Object.keys(shifts).sort((p, q) => shifts[q] - shifts[p])[0];
      let shift = best !== undefined ? Number(best) : lastDay + 1;
      // completa colunas nas pontas cujo rotulo nao foi lido (limitado pela area da tabela)
      const timeLabels = members.filter((it) => /^\d{1,2}:\d{2}$/.test(it.str));
      const leftLimit = timeLabels.length ? Math.max(...timeLabels.map((t) => t.x + t.w)) : null;
      const rightLimit = Math.max(...members.map((it) => it.x + it.w));
      while (shift > 1 && leftLimit !== null && cols[0].cx - gap - gap * 0.45 > leftLimit) {
        cols.unshift({ cx: cols[0].cx - gap, y: row.y, weekday: (cols[0].weekday + 6) % 7, virtual: true });
        shift -= 1;
      }
      while (cols.length + shift - 1 < 31 && cols[cols.length - 1].cx + gap * 1.45 < rightLimit + gap * 0.2) {
        const last = cols[cols.length - 1];
        cols.push({ cx: last.cx + gap, y: row.y, weekday: (last.weekday + 1) % 7, virtual: true });
      }
      // Numeracao recomecou (ex.: titulo do mes seguinte nao foi lido): e outro mes
      if (lastDay > 0 && shift <= lastDay) offset += 1;
      cols.forEach((c, i) => {
        const day = i + shift;
        if (day < 1 || day > 31) return;
        if (c.item) c.item.kind = 'weekday';
        if (c.num) c.num.item.kind = 'day';
        anchors.push({
          day,
          cx: c.cx,
          y: Math.max(c.y, c.num ? c.num.y : c.y),
          top: Math.min(c.y, c.num ? c.num.y : c.y) - 4,
          weekday: c.weekday,
          monthOffset: offset,
        });
      });
      // numeros que estejam na coluna mas nao foram usados nao devem virar conteudo
      candidates.forEach((n) => {
        if (n.item.kind !== 'day' && cols.some((c) => Math.abs(n.cx - c.cx) <= tol && n.y >= c.y - gap * 1.2 && n.y <= c.y + 4)) n.item.kind = 'day';
      });
      lastDay = anchors.length ? anchors[anchors.length - 1].day : lastDay;
      if (best === undefined && shift > 31) lastDay = 0;
      header.timelineGap = gap;
    });
    return anchors;
  }

  // Encontra os numeros dos dias do mes e monta as linhas encadeadas 1, 2, 3...
  function buildMonthGrid(header) {
    const members = header.members || [];
    const candidates = [];
    members.forEach((it) => {
      const day = parseDayItem(it.str);
      if (day) candidates.push({ ...day, x: it.x, cx: it.cx, y: it.y, item: it });
    });

    const timeline = buildTimelineAnchors(header, members, candidates);
    if (timeline && timeline.length >= 7) {
      header.anchors = timeline;
      header.colTol = (header.timelineGap || 20) * 0.5;
      header.layout = 'timeline';
      return;
    }
    header.layout = 'grid';
    const rows = [];
    candidates.sort((p, q) => p.y - q.y || p.cx - q.cx).forEach((c) => {
      const row = rows.find((r) => Math.abs(r.y - c.y) < 3);
      if (row) row.cells.push(c); else rows.push({ y: c.y, cells: [c] });
    });
    rows.forEach((r) => r.cells.sort((p, q) => p.cx - q.cx));

    const accepted = [];
    let expected = 1;
    rows.sort((p, q) => p.y - q.y).forEach((row) => {
      // maior trecho consecutivo da linha que comeca no dia esperado
      const cells = row.cells;
      let start = cells.findIndex((c) => c.day === expected);
      if (start < 0) return;
      const chain = [cells[start]];
      for (let i = start + 1; i < cells.length; i += 1) {
        if (cells[i].day === chain[chain.length - 1].day + 1 && cells[i].cx > chain[chain.length - 1].cx) chain.push(cells[i]);
        else break;
      }
      chain.forEach((c) => {
        c.item.kind = 'day';
        c.top = c.y - 6;
        c.monthOffset = 0;
        accepted.push(c);
      });
      expected = chain[chain.length - 1].day + 1;
    });
    header.anchors = accepted;

    // Tolerancia de coluna: metade do espacamento tipico entre dias vizinhos
    const gaps = [];
    const byRow = {};
    accepted.forEach((a) => { (byRow[a.y.toFixed(0)] || (byRow[a.y.toFixed(0)] = [])).push(a); });
    Object.values(byRow).forEach((list) => {
      list.sort((p, q) => p.cx - q.cx);
      for (let i = 1; i < list.length; i += 1) gaps.push(list[i].cx - list[i - 1].cx);
    });
    header.colTol = (median(gaps) || 30) * 0.5;

    // Dia da semana de cada numero (rotulo da coluna ou junto ao numero)
    const weekdayItems = members.filter((it) => it.kind !== 'day' && weekdayOf(it.str) !== null);
    weekdayItems.forEach((it) => { it.kind = 'weekday'; });
    accepted.forEach((a) => {
      if (a.weekday !== null && a.weekday !== undefined) return;
      let best = null;
      weekdayItems.forEach((w) => {
        const dx = Math.abs(w.cx - a.cx);
        if (dx > header.colTol || w.y > a.y + 15) return;
        const score = dx + Math.abs(w.y - a.y) * 0.01;
        if (!best || score < best.score) best = { score, wd: weekdayOf(w.str) };
      });
      a.weekday = best ? best.wd : null;
    });

  }

  // Conteudo de cada dia: texto abaixo do numero, na mesma coluna
  function assignContent(header) {
    const members = header.members || [];
    const anchors = header.anchors || [];
    anchors.forEach((a) => { a.texts = []; });
    members.forEach((it) => {
      if (it.kind === 'day' || it.kind === 'weekday' || it.kind === 'year') return;
      if (weekdayOf(it.str) !== null) return;
      if (IGNORE_RE.test(it.str) || /^\d{1,2}:\d{2}$/.test(it.str)) return;
      let best = null;
      anchors.forEach((a) => {
        const dx = Math.abs(a.cx - it.cx);
        if (dx > header.colTol || a.y > it.y + 1) return;
        if (!best || a.y > best.y || (a.y === best.y && dx < Math.abs(best.cx - it.cx))) best = a;
      });
      if (best && (!best.region || it.y <= best.region.y1 + 2)) best.texts.push(it.str);
    });
  }

  // Area de cada celula (para a leitura por cor em PDF digitalizado)
  function computeCellRegions(header, pageBottom, headers, typicalBlock) {
    const below = headers
      .filter((o) => o !== header && o.y > header.y + 2 && o.right > header.left && o.left < header.right)
      .sort((p, q) => p.y - q.y)[0];
    let blockBottom = below ? below.y - 6 : pageBottom;
    // ultimo bloco da pagina: nao avancar sobre tabelas abaixo do calendario
    if (!below && typicalBlock) blockBottom = Math.min(blockBottom, header.y + typicalBlock - 6);
    const anchors = header.anchors || [];
    anchors.forEach((a) => {
      const next = anchors
        .filter((o) => o !== a && Math.abs(o.cx - a.cx) <= header.colTol && o.top > a.y + 2)
        .sort((p, q) => p.top - q.top)[0];
      a.region = {
        x0: a.cx - header.colTol * 0.75,
        x1: a.cx + header.colTol * 0.75,
        y0: a.y + 2,
        y1: Math.max(a.y + 4, (next ? next.top : blockBottom) - 1),
      };
    });
  }

  function classify(texts, minClassTokens = 1, color = null, classTokenRe = null) {
    let holiday = 0;
    let off = 0;
    const classTokens = [];
    texts.forEach((t) => {
      const n = norm(t);
      if (!n) return;
      if (HOLIDAY_RE.test(n)) holiday += 1;
      else if (OFF_RE.test(n)) off += 1;
      else if (classTokenRe ? classTokenRe.test(t) : /[a-z]/.test(n)) classTokens.push(t);
    });
    if (classTokens.length >= minClassTokens && classTokens.length > Math.max(holiday, off)) return { type: 'class', slots: classTokens.length, label: mostCommon(classTokens) };
    if (holiday && holiday >= off) return { type: 'holiday', label: 'Feriado' };
    if (off) return { type: 'off', label: mostCommonOff(texts) };
    // Sem texto confiavel: usa a cor da celula (PDF digitalizado)
    if (color === 'class') return { type: 'class', slots: classTokens.length || null, label: mostCommon(classTokens) || 'Aula', byColor: true };
    if (color === 'recess') return { type: 'off', label: 'Recesso', byColor: true };
    if (color === 'off') return { type: 'off', label: 'Dia não letivo', byColor: true };
    return { type: 'empty' };
  }

  function mostCommon(list) {
    const counts = {};
    list.forEach((v) => { counts[v] = (counts[v] || 0) + 1; });
    return Object.keys(counts).sort((p, q) => counts[q] - counts[p])[0] || '';
  }

  function mostCommonOff(texts) {
    const off = texts.filter((t) => OFF_RE.test(norm(t)));
    const label = mostCommon(off);
    return label ? label.charAt(0).toUpperCase() + label.slice(1).toLowerCase() : 'Sem aula';
  }

  function sameRowValue(items, labelRe, valueRe) {
    const label = items.find((it) => labelRe.test(norm(it.str)));
    if (!label) return null;
    // valor no proprio item ("Turno: Matutino") ou no item seguinte da mesma linha
    const inline = norm(label.str).replace(labelRe, '').replace(/^[:\s]+/, '');
    if (inline && valueRe.test(inline)) return inline.match(valueRe);
    const next = items
      .filter((o) => o !== label && Math.abs(o.y - label.y) < 4 && o.x > label.x && valueRe.test(norm(o.str)))
      .sort((p, q) => p.x - q.x)[0];
    return next ? norm(next.str).match(valueRe) : null;
  }

  function sameRowRaw(items, labelRe) {
    const label = items.find((it) => labelRe.test(norm(it.str)));
    if (!label) return '';
    const inline = label.str.replace(/^[^:]*:\s*/, '').trim();
    if (inline && inline !== label.str) return inline;
    const next = items
      .filter((o) => o !== label && Math.abs(o.y - label.y) < 4 && o.x > label.x && o.x - (label.x + label.w) < 120)
      .sort((p, q) => p.x - q.x)[0];
    return next && !/:$/.test(next.str) ? next.str.trim() : '';
  }

  function detectMeta(pages, firstHeaderY) {
    const meta = {};
    const all = pages.flatMap((p) => p.items);
    const firstPage = pages[0] ? pages[0].items : [];

    let m = sameRowValue(all, /^carga horaria total/, /^(\d{2,5})$/);
    if (m) meta.totalHours = Number(m[1]);
    if (!meta.totalHours) {
      const joined = norm(all.map((it) => it.str).join(' '));
      const t = joined.match(/carga horaria (?:total)?\s*:?\s*(\d{2,5})\s*h/) || joined.match(/(\d{3,5})\s*horas/);
      if (t) meta.totalHours = Number(t[1]);
    }
    m = sameRowValue(all, /^aulas por dia/, /^(\d{1,2})$/);
    if (m) meta.classesPerDay = Number(m[1]);
    m = sameRowValue(all, /^tempo da aula/, /^(\d{2,3})\s*min/);
    if (m) meta.classMinutes = Number(m[1]);
    m = sameRowValue(all, /^turno/, /(matutino|manha|vespertino|tarde|noturno|noite|integral)/);
    if (m) {
      const t = m[1];
      meta.shift = /matutino|manha/.test(t) ? 'morning' : /vespertino|tarde/.test(t) ? 'afternoon' : /noturno|noite/.test(t) ? 'night' : null;
    }
    const course = sameRowRaw(all, /^curso\s*:/);
    if (course) meta.course = course;
    const turma = all.map((it) => sameRowRaw([it, ...all.filter((o) => o.page === it.page)], /^turma\s*:/)).find(Boolean)
      || sameRowRaw(all, /^turma\s*:/);
    if (turma) meta.classCode = turma;

    // Horario: menor inicio e maior termino entre os horarios do cabecalho
    const times = firstPage
      .filter((it) => (firstHeaderY === null || it.y < firstHeaderY) && /^\d{1,2}:\d{2}$/.test(it.str))
      .map((it) => it.str.padStart(5, '0'))
      .sort();
    if (times.length >= 2) meta.time = `${times[0]} às ${times[times.length - 1]}`;
    return meta;
  }

  function fmt(y, m, d) {
    return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }

  function parse(pages, options = {}) {
    const minClassTokens = options.minClassTokens || 1;
    const parsedPages = pages.map((p, i) => parsePage(p.items || [], i));
    // altura tipica de um bloco de mes (distancia entre cabecalhos empilhados)
    const blockHeights = [];
    parsedPages.forEach((pp) => {
      pp.headers.forEach((h) => {
        const below = pp.headers
          .filter((o) => o !== h && o.y > h.y + 2 && o.right > h.left && o.left < h.right)
          .sort((p, q) => p.y - q.y)[0];
        if (below) blockHeights.push(below.y - h.y);
      });
    });
    const typicalBlock = median(blockHeights);
    parsedPages.forEach((pp) => {
      pp.headers.forEach((h) => computeCellRegions(h, pp.pageBottom, pp.headers, typicalBlock));
      pp.headers.forEach((h) => assignContent(h));
    });
    const headers = parsedPages.flatMap((p) => p.headers).filter((h) => h.anchors && h.anchors.length >= 7);
    headers.sort((p, q) => p.page - q.page || p.y - q.y || p.cx - q.cx);

    const result = { days: {}, months: [], meta: {}, warnings: [], hasText: parsedPages.some((p) => p.items.length > 0) };
    if (!headers.length) {
      result.meta = detectMeta(parsedPages, null);
      return result;
    }

    // Cada cabecalho pode conter mais de um mes (quando o titulo seguinte nao foi lido)
    const groups = [];
    headers.forEach((h) => {
      const offsets = [...new Set(h.anchors.map((a) => a.monthOffset || 0))].sort((p, q) => p - q);
      offsets.forEach((off) => {
        const anchors = h.anchors.filter((a) => (a.monthOffset || 0) === off);
        if (anchors.length < 7) return;
        const monthIndex = h.month + off;
        groups.push({
          header: h,
          offset: off,
          anchors,
          month: monthIndex % 12,
          yearCarry: Math.floor(monthIndex / 12),
          explicitYear: off === 0 ? h.year : null,
          label: off === 0 ? h.item.str : `${MONTH_LABELS[monthIndex % 12]} (título não lido)`,
        });
      });
    });

    // Ano de cada mes: explicito no cabecalho, "Ano: 2026" acima na pagina ou sequencia dos meses
    let lastYear = null;
    let lastMonth = null;
    groups.forEach((g) => {
      const h = g.header;
      let year = g.explicitYear || (h.year ? h.year + g.yearCarry : null);
      if (!year) {
        const page = parsedPages[h.page];
        const above = page.yearItems.filter((yi) => yi.y <= h.y + 2).sort((p, q) => q.y - p.y)[0];
        if (above) year = above.year + g.yearCarry;
      }
      if (!year && lastYear !== null) year = g.month < lastMonth ? lastYear + 1 : lastYear;
      if (year && !h.year && lastYear !== null && lastMonth !== null && year === lastYear && g.month < lastMonth) {
        // "Ano:" desatualizado para a linha seguinte (ex.: Dez -> Jan)
        year = lastYear + 1;
      }
      // Confirma (ou descobre) o ano pelo dia da semana dos numeros, quando houver
      const withWeekday = g.anchors.filter((a) => a.weekday !== null && a.weekday !== undefined);
      if (withWeekday.length >= 5) {
        const score = (y) => withWeekday.filter((a) => new Date(y, g.month, a.day).getDay() === a.weekday).length / withWeekday.length;
        const base = year || new Date().getFullYear();
        let bestYear = year;
        let bestScore = year ? score(year) : -1;
        for (let y = base - 3; y <= base + 3; y += 1) {
          const sc = score(y);
          if (sc > bestScore + 0.2) { bestScore = sc; bestYear = y; }
        }
        year = bestYear;
        g.weekdayScore = bestScore;
      }
      g.year = year;
      if (year) { lastYear = year; lastMonth = g.month; }
    });

    const meta = detectMeta(parsedPages, headers[0].page === 0 ? headers[0].y : null);
    result.meta = meta;

    groups.forEach((g) => {
      if (!g.year) {
        result.warnings.push(`Não foi possível identificar o ano do mês ${g.label}.`);
        return;
      }
      const y = g.year;
      const daysInMonth = new Date(y, g.month + 1, 0).getDate();
      const summary = { year: y, month: g.month, label: g.label, classDays: 0, holidays: 0, off: 0, foundDays: g.anchors.length };
      g.anchors.forEach((a) => {
        if (a.day > daysInMonth) return;
        let color = null;
        if (typeof options.cellColor === 'function' && a.region) {
          try { color = options.cellColor(g.header.page, a.region); } catch (e) { color = null; }
        }
        const info = classify(a.texts || [], minClassTokens, color, options.classTokenRe || null);
        const key = fmt(y, g.month, a.day);
        if (info.type === 'empty') return;
        // Se o mesmo dia aparecer duas vezes, prevalece a informacao de aula
        if (result.days[key] && result.days[key].type === 'class' && info.type !== 'class') return;
        result.days[key] = info;
        if (info.type === 'class') summary.classDays += 1;
        else if (info.type === 'holiday') summary.holidays += 1;
        else summary.off += 1;
      });
      if (g.weekdayScore !== undefined && g.weekdayScore < 0.6) {
        result.warnings.push(`Confira ${g.label} de ${y}: os dias da semana do PDF não batem com o calendário.`);
      }
      result.months.push(summary);
    });
    return result;
  }

  const api = { parse, _internals: { norm, parseMonthHeader, parseDayItem, classify, normalizeItems } };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.SchoolPdfParser = api;
}(typeof window !== 'undefined' ? window : globalThis));
