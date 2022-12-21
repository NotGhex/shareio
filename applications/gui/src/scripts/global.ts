const host = document.querySelector<HTMLButtonElement>('button#host');
const connect = document.querySelector<HTMLButtonElement>('button#connect');

host?.addEventListener('click', () => alert('Host'));
connect?.addEventListener('click', () => alert('Connect'));