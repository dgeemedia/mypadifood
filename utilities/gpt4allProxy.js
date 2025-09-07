// lightweight local proxy stub. Replace with an actual GPT4All connector if you run the model.
module.exports = async function chatProxy(message) {
  // naive canned response
  return { reply: `Sorry, GPT4All proxy not configured. Received: ${message.slice(0,120)}` };
};
