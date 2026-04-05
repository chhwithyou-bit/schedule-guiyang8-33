const res = await fetch('http://127.0.0.1:8787/api/community/posts', {
  method: 'GET'
});
console.log(res.status);
console.log(await res.text());
