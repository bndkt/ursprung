# 18 — Streaming server render: ordering, async components, and flush points

Type: grilling
Status: open
Blocked by: 09
Map: [ursprung v0](../map.md)

## Question

Constraint 12: streaming SSR in v0, in-order only, an async component blocks the stream
at its position, no out-of-order flushing and no placeholder-then-patch. This ticket
turns that into a rendering protocol. Ticket 19 depends on it, because the resumability
payload has to interleave with whatever this produces.

Decide:

- **The rendering walk.** How does the tree become bytes — a recursive walk writing into
  a stream, a generator, or a queue of pending work? An async component suspends the walk
  at its position, so whatever the mechanism, it must be resumable mid-tree. Which
  JavaScript construct carries that: `async` recursion, an explicit stack, or an async
  generator?
- **The stream type.** `ReadableStream` and `Response` on Workers. Do we emit strings or
  bytes, and where does encoding happen? Is there backpressure handling in v0?
- **Flush points.** When does a chunk actually go out? Every element, every component,
  every N bytes, or only when an async boundary forces it? A wrong answer here is either
  a performance problem or a correctness one, and it directly bounds how early the
  browser can start work.
- **The document shell.** `<head>`, the opening tags, and the script/asset references for
  the route's client bundle — these must be emitted before the body, but what goes in
  them may not be known until components have run. Say how that is resolved without
  buffering the whole document. (Related fog on the map: head and metadata management.)
- **Escaping.** Text content, attribute values, and anything interpolated. Where does it
  happen, is it possible to bypass, and is there an unescaped-HTML escape hatch at all?
- **Errors mid-stream.** The status code is already sent and half the document is on the
  wire when a component throws. What does the client receive? This is the ugliest case in
  streaming SSR and v0 needs _an_ answer even if it is a blunt one.
- **Client components during SSR.** They render on the server (constraint from the
  vision). What is different about rendering one — what extra markers or attributes does
  the output carry, and does that belong here or in ticket 19?
- **Static generation.** The vision mentions static page generation. Is that just running
  this renderer to completion and storing the bytes, or is it a separate mode? If it is
  just that, say so and close the question.
- **What the string renderer is, in terms of ticket 16's host interface** — an
  implementation of it, or a separate path.
