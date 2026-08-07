---
title: "Written from scratch, for agents"
description: "Ursprung's primary users are meant to be AI agents, which licenses design decisions that would be unreasonable to ask of a human developer."
date: "2026-08-07"
---

The `ursprung` package currently exports two strings: its own name and its own version, read from its own manifest. Four lines of code. The web app that consumes it is seven lines and answers every request with `ursprung v0.0.5`.

The plan for it is a full-stack application framework with its own bundler, its own JSX runtime, its own TypeScript type stripping, fine-grained reactivity with no virtual DOM, an RPC layer that turns an ordinary import statement into a network call, and eventually an iOS app driven by a JavaScript engine embedded in a SwiftUI host.

Stating that gap plainly is the honest way to start. What follows is the argument for why the gap might be closeable at all, because on its face "write your own bundler" is the kind of idea that ends in a graveyard of half-finished parsers.

## Narrow beats general

The reason a bundler is a large program is that a general-purpose bundler is general-purpose. It cannot know what it is compiling, so it has to handle stylesheets, images, three module systems, a decade of browser targets, and every configuration anyone ever needed. Most of that size is optionality.

Ursprung's bundler starts from a single entry point — the configuration file — discovers the route tree from there, and walks the dependency graph. It knows exactly what it is looking at: a TypeScript application written against Ursprung. That knowledge is what lets it be small. It parses TypeScript, strips erasable syntax, understands ESM, builds one module graph, splits that graph into a server bundle and one bundle per route, and generates RPC stubs where a client module imports from a server module. Stylesheets are not in that list, and neither is any other asset pipeline. Anything outside the list needs a concrete architectural reason to get in.

Each of the project's constraints is really a deletion. ESM only means no interop layer. Erasable TypeScript syntax only means no general-purpose TypeScript compiler — no `enum` lowering, no namespace emit, no downlevel anything, just removing type syntax and leaving the JavaScript as close to untouched as possible. Latest platform capabilities only means no transpilation targets and no polyfills. The bet is that the sum of those deletions is the difference between a project that can be written from scratch and one that cannot.

## The part that is actually new

Own bundler, no virtual DOM, resumability, signals — none of that is unprecedented. The idea doing the real work in Ursprung is that the framework's first-class users are AI agents rather than human developers.

That sounds like positioning until you notice what it licenses. A framework designed for humans has to economise on the user's patience. Verbosity is a cost, repetition is a cost, and ceremony that a person has to type every time is the thing frameworks compete to remove. Magic — inference, convention, implicit behaviour — is how you buy that economy, and you pay for it with hidden complexity in the implementation and a system that is harder to reason about from the outside.

An agent does not get bored. So the trade reverses: you can demand more explicitness than a human would tolerate, and spend the savings on a simpler system.

The first decision made under that rule is already written down as an architecture decision record. Every first-party module has to declare which side of the client/server boundary it belongs to, in its filename — `.server.ts`, `.client.tsx`, `.shared.ts`. There is no default. An unsuffixed `.ts` file that the graph reaches is a build error.

For a human that is tedious: renaming every file in the project, and touching the rename again whenever a module moves sides. For an agent it is one more convention to follow consistently, which is the thing agents are good at. What it buys is worth having. The boundary becomes visible in every import statement and every directory listing. "Which bundle does this end up in?" is answerable by reading a filename instead of running the bundler. And the graph colouring algorithm needs no inference at all for code we control, which means the invariant that matters most — server code never reaches a client bundle — rests on a rule you can check by eye.

The same principle has a name in the vision: less magic. Not as an aesthetic preference, but because everything an agent has to inspect, generate and reason about gets cheaper when there is nothing hidden.

## What this does not make easy

Plenty. Resumability — rendering on the server and continuing on the client without executing the component tree again — is hard for reasons that no amount of explicitness helps with, because the difficulty is in what the server has to put on the wire, not in what the application author writes. The same is true of the server boundary: a client component importing a function from a `.server.ts` file reads as an ordinary import, and the bundler is expected to turn it into a stub, a capnweb call, a Worker endpoint, and a real function on the other side. That transformation is the most magical thing in the whole design, sitting inside a project whose stated principle is less magic.

Whether that tension is a flaw or the point is not settled yet.

The repository today is a scaffold: two workspaces, no build step, a Worker that returns a string. The next post covers what happened when we tried to work out what v0 actually is, before writing any of it.
