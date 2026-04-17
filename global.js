console.log('IT’S ALIVE!');

function $$(selector, context = document) {
  return Array.from(context.querySelectorAll(selector));
}

/* handles starting points when the site runs locally vs. from github page*/
const BASE_PATH = (location.hostname === "localhost" || location.hostname === "127.0.0.1")
    ? '/'
    : '/portfolio/';

let pages = [
    { url: '', title: 'Home' },
    { url: 'resume/', title: 'Resume' },
    { url: 'projects/', title: 'Projects' },
    { url: 'contact/', title: 'Contact' },
    { url: 'https://github.com/anhpham2003', title: 'GitHub' },
];

/* creates nav */
let nav = document.createElement('nav');
document.body.prepend(nav);

for (let p of pages) {
  let url = p.url;
  let title = p.title;

  url = !url.startsWith('http') ? BASE_PATH + url : url;

  let a = document.createElement('a');
  a.href = url;
  a.textContent = title;

  /* highlight current page */
  a.classList.toggle(
    'current',
    a.host === location.host && a.pathname === location.pathname,
  );

  /* open github */
  if (a.host !== location.host) {
    a.target = '_blank';
  }

  nav.append(a);
}
