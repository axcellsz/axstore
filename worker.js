export default {
  async fetch(request, env) {
    return new Response("TEST WORKER ACTIVE");
  }
}
