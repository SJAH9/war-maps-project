'use strict';

(() => {
  const clock = document.querySelector('.human-cost-clock');
  if (!clock) return;

  const marksHost = clock.querySelector('.human-cost-clock-marks');
  const count = clock.querySelector('.human-cost-clock-count');
  const pageFlash = document.querySelector('.human-cost-page-flash');
  const disclosure = document.querySelector('.human-cost-disclosure');
  const disclosureCount = disclosure?.querySelector('[data-human-cost-total]');
  const disclosureRate = disclosure?.querySelector('[data-human-cost-rate]');
  const disableFlashes = disclosure?.querySelector('[data-human-cost-disable]');
  const dismissDisclosure = disclosure?.querySelector('[data-human-cost-dismiss]');
  const marks = Array.from({length: 250}, () => {
    const mark = document.createElement('i');
    marksHost.append(mark);
    return mark;
  });
  const epoch = Date.UTC(2026, 0, 1);
  const end = Date.UTC(2027, 0, 1);
  const annualTotal = 140009;
  const period = (end - epoch) / annualTotal;
  const displayedRate = Math.round(period / 10000) * 10;
  const disabledKey = 'war-maps-human-cost-flashes-disabled';
  const explainedKey = 'war-maps-human-cost-explained';
  let lastCycle = null;
  let flashTimer = null;
  let disclosureTimer = null;

  function stored(storage, key) {
    try { return storage.getItem(key) === 'true'; } catch (_) { return false; }
  }

  function store(storage, key, value) {
    try { storage.setItem(key, String(value)); } catch (_) {}
  }

  let flashesDisabled = stored(localStorage, disabledKey);
  clock.classList.toggle('is-disabled', flashesDisabled);

  function state(now) {
    const elapsed = Math.max(0, Math.min(now, end) - epoch);
    return {
      count: Math.min(annualTotal, Math.floor(elapsed / period)),
      second: Math.min(249, Math.floor((elapsed % period) / 1000))
    };
  }

  function hideDisclosure() {
    if (!disclosure) return;
    disclosure.hidden = true;
    document.body.classList.remove('human-cost-intro-open');
    clock.focus({preventScroll: true});
  }

  function showDisclosure(current) {
    if (!disclosure || stored(sessionStorage, explainedKey)) return;
    store(sessionStorage, explainedKey, true);
    disclosureCount.textContent = current.count.toLocaleString('en-US');
    disclosureRate.textContent = displayedRate.toLocaleString('en-US');
    disableFlashes.checked = false;
    disclosure.hidden = false;
    document.body.classList.add('human-cost-intro-open');
    disclosure.querySelector('h2').focus({preventScroll: true});
  }

  function flash(current) {
    if (flashesDisabled || document.hidden || !pageFlash) return;
    pageFlash.classList.add('is-visible');
    clearTimeout(flashTimer);
    flashTimer = setTimeout(() => pageFlash.classList.remove('is-visible'), 180);
    if (!stored(sessionStorage, explainedKey)) {
      clearTimeout(disclosureTimer);
      disclosureTimer = setTimeout(() => showDisclosure(current), 700);
    }
  }

  function tick() {
    const current = state(Date.now());
    marks.forEach((mark, index) => mark.classList.toggle('lit', index < current.second));
    count.textContent = current.count.toLocaleString('en-US');
    if (lastCycle !== null && current.count > lastCycle) flash(current);
    lastCycle = current.count;
    setTimeout(tick, Math.max(20, 1000 - Date.now() % 1000));
  }

  dismissDisclosure?.addEventListener('click', () => {
    if (disableFlashes.checked) {
      flashesDisabled = true;
      store(localStorage, disabledKey, true);
      clock.classList.add('is-disabled');
    }
    hideDisclosure();
  });
  disclosure?.addEventListener('keydown', event => {
    if (event.key === 'Escape') hideDisclosure();
  });

  tick();
  window.WarMapsHumanCostClock = {state, flash};
})();
