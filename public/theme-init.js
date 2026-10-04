(function () {
  var stored = null;
  try {
    stored = window.localStorage.getItem('sa.theme');
  } catch (e) {
    stored = null;
  }
  var dark;
  if (stored === 'dark') {
    dark = true;
  } else if (stored === 'light') {
    dark = false;
  } else {
    dark = !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
  }
  if (dark) {
    document.documentElement.classList.add('dark');
  }
})();
