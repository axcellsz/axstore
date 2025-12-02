export default {
  async fetch(request, env, ctx) {
    return new Response("Hallo Indonesia!", {
      headers: {
        "content-type": "text/plain; charset=UTF-8"
      }
    });
  }
};
