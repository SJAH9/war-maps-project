(() => {
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').catch(error => console.warn('Offline setup unavailable', error));
  }
  let pending;
  const button = document.createElement('button');
  button.className = 'install-action'; button.type = 'button'; button.hidden = true;
  button.textContent = 'Install War Maps';
  (document.querySelector('footer') || document.body).append(button);
  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault(); pending = event; button.hidden = false;
  });
  button.addEventListener('click', async () => {
    if (!pending) return;
    await pending.prompt(); await pending.userChoice; pending = null; button.hidden = true;
  });
  window.addEventListener('appinstalled', () => { pending = null; button.hidden = true; });
})();
