(() => {
  const toggle=document.querySelector('#theme-toggle');
  if(!toggle)return;
  toggle.addEventListener('click',()=>{
    const theme=document.documentElement.dataset.theme==='dark'?'light':'dark';
    document.documentElement.dataset.theme=theme;
    try{localStorage.setItem('war-maps-theme',theme);}catch(error){ /* Theme still applies. */ }
  });
})();
