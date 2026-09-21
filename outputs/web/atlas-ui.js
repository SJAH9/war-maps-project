(() => {
  const page = location.pathname.split('/').pop() || 'index.html';
  const navItems = [
    ['index.html', 'Start'],
    ['network.html', 'Conflict network'],
    ['map.html', 'World map'],
    ['graph.html', 'Relationships'],
    ['civilian-casualties.html', 'Human cost'],
    ['life-death.html', 'Living conditions'],
    ['gas-map.html', 'Fuel prices'],
    ['newsmedia.html', 'NewsMedia'],
    ['information.html', 'Evidence guide']
  ];
  const documentationPages = new Set(['information.html', 'about.html', 'method.html', 'data-conflict.html', 'data-governance.html', 'data-health.html', 'data-maps.html', 'coverage.html', 'sources.html', 'color-legend.html']);
  const header = document.querySelector('.site-header');
  const main = document.querySelector('main');
  if (main && !main.id) main.id = 'main-content';
  if (main && !document.querySelector('.skip-link')) {
    const skip = document.createElement('a');
    skip.className = 'skip-link';
    skip.href = '#main-content';
    skip.textContent = 'Skip to main content';
    document.body.prepend(skip);
  }
  if (header) {
    const nav = header.querySelector('nav[aria-label="Primary navigation"]');
    if (nav) {
      nav.classList.add('primary-nav');
      nav.innerHTML = navItems.map(([href, label]) => {
        const current = page === href || (href === 'information.html' && documentationPages.has(page));
        return `<a href="${href}"${current ? ' aria-current="page"' : ''}>${label}</a>`;
      }).join('');
      nav.insertAdjacentHTML('beforebegin', '<button class="nav-toggle" type="button" aria-expanded="false" aria-controls="primary-navigation">Explore</button>');
      nav.id = 'primary-navigation';
      const toggle = header.querySelector('.nav-toggle');
      toggle.addEventListener('click', () => {
        const open = toggle.getAttribute('aria-expanded') !== 'true';
        toggle.setAttribute('aria-expanded', String(open));
        nav.dataset.open = String(open);
      });
    }
  }

  const toggle = document.querySelector('#theme-toggle');
  if (toggle && page === 'index.html') {
    toggle.addEventListener('click', () => {
      const theme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
      document.documentElement.dataset.theme = theme;
      try { localStorage.setItem('war-maps-theme', theme); } catch (error) { /* Theme still applies. */ }
    });
  }

  const contexts = {
    'network.html': {
      question: 'Who and what is connected inside one conflict?',
      read: 'Choose a conflict, then follow its sides, participants, places, and dated observations. Lines show a relationship in the loaded record—not command, intent, blame, or legal responsibility.',
      status: 'Sourced observations + labelled project inference',
      sources: [['UCDP data', 'https://ucdp.uu.se/downloads/'], ['Posture method', 'method.html#posture-method'], ['Coverage', 'coverage.html']]
    },
    'graph.html': {
      question: 'Which states and organizations are connected by recorded participation?',
      read: 'Begin with a country or organization. Each observed line means same-side participation in at least one conflict-year; organization lines mean sourced co-membership. Change the layout to inspect structure without changing the evidence.',
      status: 'Observed links unless a comparison topology is selected',
      sources: [['UCDP data', 'https://ucdp.uu.se/downloads/'], ['Relationship rules', 'method.html#relationship-method'], ['View as data', 'sources.html']]
    },
    'map.html': {
      question: 'Where and when does the loaded record show organized conflict?',
      read: 'Set a time window, then select a place or conflict. Color represents the number of loaded records—not territorial control, danger, military power, or total deaths.',
      status: 'Conflict-year and provisional candidate-event records',
      sources: [['UCDP data', 'https://ucdp.uu.se/downloads/'], ['Conflict definitions', 'data-conflict.html'], ['Coverage', 'coverage.html']]
    },
    'life-death.html': {
      question: 'How do conflict observations sit inside unequal living conditions?',
      read: 'Turn measures on and off and move through source years. Every measure has its own unit and scale; column heights are comparisons within a measure and must not be added together.',
      status: 'Multiple sources · separate units · no causal claim',
      sources: [['Health sources', 'data-health.html'], ['UCDP data', 'https://ucdp.uu.se/downloads/'], ['Full citations', 'sources.html']]
    },
    'gas-map.html': {
      question: 'How do reported pump prices differ across places?',
      read: 'Compare gasoline, diesel, or both on one fixed $0–$10 USD-per-gallon height scale. Dates and geographic resolution differ by publisher; select any tower before comparing it.',
      status: 'Source-dated market snapshot · not a live feed',
      sources: [['Price sources and dates', 'data-maps.html'], ['Conversion method', 'data-maps.html#fuel-conversion'], ['Coverage', 'coverage.html']]
    },
    'civilian-casualties.html': {
      question: 'Where does UCDP record civilian deaths in organized violence?',
      read: 'Choose an inclusive date range. Towers total the civilian-death field for events coded in each country; they are not a complete accounting of war deaths, indirect deaths, or every victim.',
      status: 'Recorded event deaths · incomplete by definition',
      sources: [['UCDP GED', 'https://ucdp.uu.se/downloads/'], ['Casualty boundaries', 'data-maps.html#civilian-casualties'], ['Coverage', 'coverage.html']]
    },
    'newsmedia.html': {
      question: 'How are current events being presented across national news sources?',
      read: 'Compare live coverage without treating a broadcast as a verified observation. Channel selection and framing are publisher decisions; War Maps does not transcribe, rank, or endorse them.',
      status: 'Live publisher streams · contextual, not evidentiary',
      sources: [['NewsBoob source', 'https://github.com/SJAH9/newsboob'], ['Evidence guide', 'information.html'], ['Project method', 'method.html']]
    },
    'nation.html': {
      question: 'What does the loaded record contain about one country over time?',
      read: 'Move the year control or open the all-time and raw-data views. Relationships reproduce coded participation for a particular conflict and period; they are not permanent alliances or hostilities.',
      status: 'UCDP conflict records + V-Dem country-years',
      sources: [['Conflict data', 'data-conflict.html'], ['Governance data', 'data-governance.html'], ['Raw source guide', 'sources.html']]
    }
  };
  const context = contexts[page];
  if (context && main && !document.querySelector('.view-context')) {
    const section = document.createElement('section');
    section.className = 'view-context';
    section.setAttribute('aria-label', 'How to read this view');
    section.innerHTML = `<div><p class="eyebrow">Question this view can answer</p><h2>${context.question}</h2><p>${context.read}</p></div><div class="evidence-key"><span><i class="evidence-source"></i>Source record</span><span><i class="evidence-transform"></i>Project transformation</span><span><i class="evidence-inference"></i>Inference</span><strong>${context.status}</strong></div><nav aria-label="Sources for this view">${context.sources.map(([label, href]) => `<a href="${href}">${label}</a>`).join('')}</nav>`;
    main.prepend(section);
  }

  document.querySelectorAll('footer').forEach((footer) => {
    if (footer.querySelector('.project-support')) return;
    const support = document.createElement('div');
    support.className = 'project-support';
    support.innerHTML = '<a href="donate.html">Support this project</a> · <a href="donate.html">1LoNg5YrKJ6xM5oKvcCP7nZ1RAuj9wj4Hr</a><br><small>Support is welcome, never obligatory. This project was produced through the time and energy of its principal investigator and over a billion tokens. It satisfied the gnawing need to do something about the state of the world without taking a side or making futile sacrifices. It feels good to work on; it would not feel bad to contribute to it.</small>';
    footer.append(support);
  });
})();
