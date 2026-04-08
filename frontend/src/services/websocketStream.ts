/**
 * websocketStream — turns a WebSocket connection into an AsyncGenerator.
 *
 * Usage:
 *   yield* websocketStream<MyType>(url, (data, push, close, error) => {
 *     // called for every incoming message
 *     push(data as MyType);           // enqueue a value
 *     close();                         // signal end-of-stream
 *     error(new Error("bad"));         // signal error
 *   });
 *
 * The optional onOpen callback fires when the connection opens. Use it to
 * send an initial payload. It receives a `send` function instead of the
 * raw WebSocket so callers don't need to hold a reference.
 *
 * The generator closes the WebSocket cleanly when the caller returns or
 * breaks (e.g. via gen.return() on component unmount).
 */
export async function* websocketStream<T>(
  url: string,
  onMessage: (
    data: unknown,
    push: (value: T) => void,
    close: () => void,
    error: (err: Error) => void,
  ) => void,
  onOpen?: (
    send: (data: string) => void,
    push: (value: T) => void,
    close: () => void,
    error: (err: Error) => void,
  ) => void | Promise<void>,
): AsyncGenerator<T> {
  type Node = { value: T; next: Promise<Node | null> };

  const { promise: head, resolve: initResolve, reject: initReject } =
    Promise.withResolvers<Node | null>();
  let resolveNext = initResolve;
  let rejectNext = initReject;

  const push = (value: T): void => {
    const { promise: next, resolve, reject } = Promise.withResolvers<Node | null>();
    resolveNext({ value, next });
    resolveNext = resolve;
    rejectNext = reject;
  };

  const close = (): void => resolveNext(null);
  const error = (err: Error): void => rejectNext(err);

  const ws = new WebSocket(url);

  if (onOpen) {
    ws.onopen = () => {
      Promise.resolve(onOpen((data) => ws.send(data), push, close, error)).catch(error);
    };
  }

  ws.onmessage = (event) => {
    try {
      onMessage(JSON.parse(event.data), push, close, error);
    } catch (e) {
      error(e instanceof Error ? e : new Error(String(e)));
    }
  };

  ws.onerror = () => error(new Error("WebSocket connection failed"));

  ws.onclose = (event) => {
    if (event.wasClean || event.code === 1000) {
      close();
    } else {
      error(new Error("WebSocket closed unexpectedly"));
    }
  };

  try {
    let node = await head;
    while (node !== null) {
      yield node.value;
      node = await node.next;
    }
  } finally {
    ws.close();
  }
}
