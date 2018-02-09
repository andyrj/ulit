# ulit
[![npm version](https://badge.fury.io/js/ulit.svg)](https://badge.fury.io/js/ulit)
[![Codacy Badge](https://api.codacy.com/project/badge/Grade/74420ad6de824a64a06235becc1810c2)](https://www.codacy.com/app/andyrjohnson82/ulit?utm_source=github.com&amp;utm_medium=referral&amp;utm_content=andyrj/ulit&amp;utm_campaign=Badge_Grade)
[![Codacy Badge](https://api.codacy.com/project/badge/Coverage/74420ad6de824a64a06235becc1810c2)](https://www.codacy.com/app/andyrjohnson82/ulit?utm_source=github.com&utm_medium=referral&utm_content=andyrj/ulit&utm_campaign=Badge_Coverage)
[![Build Status](https://travis-ci.org/andyrj/ulit.svg?branch=master)](https://travis-ci.org/andyrj/ulit)

*WIP* Tagged Template Literal html template library.  Inspired by lit-html/hyperHTML.
 - This branch is a rewrite to functional typescript...

TODO:
1. Correct repeat()
2. get test coverage up to 100/100

## Why another tagged template literal library?
"I cannot understand what I cannot build." - Feynman

Started this from a desire to see how hard it would be to improve upon the implementations of lit-html and hyperHTML, focusing on feature density and utilizing the platform, but abandoning support for legacy browsers to use the latest features without transpiling to es5 (instead targeting Chrome, Firefox, Safari, Edge latest versions).

## What was the result?

Rough parity with lit-extended on features and general api setup.

Improvements:
* Transparent svg support - (no need for special svg tag function)
* Simple depth first search walkDOM(fn) avoids using slow TreeWalker api (even if that's only a perf hit in the initial un-cached render()) client side.
* SSR support via serializable part paths.  This uses followPath(Array<Number|String>), which handles most of the setup work can be pre-rendered down to static html that can be delivered to the client and hydrated.
* By using "{{}}" for attributes and <!--{{}}--> for part placeholders, this library doesn't need to use regex, doesn't force quotes on attributes in templates and can be generally simpler.

## How can I use it?
### Install
```
npm install --save ulit
```

#### Simple Example Code
```js
// repeat is used for rendering keyed lists of dom nodes
// until allows you to conditionally load a template that is replaced upon promise completion (code-splitting, fetch, etc...)
import { html, render, repeat, until } from "ulit";

// "components" are just template functions
const hello = subject => html`<h1>hello ${subject}</h1>`;

// render defaults to rendering to document.body if no other container is provided
render(hello("world"), document.body);

// calling render multiple times on the same container will update the current template in place if possible or replace it.
render(hello("internet"));

// Build your own directive to extend ulit...
// the example below defaultDirective is essentially what ulit does by default without a directive internally
const defaultDirective = value => part => {
  part.update(value);
};

render(html`<h1>${defaultDirective("pass through example...")}</h1>`);

// Example Part API brain dump
const partApiDirective = () => part => {
  // update part with a new PartValue
  part.update("test");

  // parts have a dispose event so that you can clean up anything your directives create on dispose...
  // parts are disposed when templates replace one another and have differing static parts, or when a part changes from a directive to another valid PartValue
  const handler = part => {
    // normally clean up whatever LUT/cache you have seems like Map<part, ...> is pretty useful inside directives
  };
  part.addDisposer(handler);
  part.removeDisposer(handler);

  // readonly/private typescript classes enforced at runtime in javascript via es6 proxy...
  part.path; // readonly Array<string | number>, the path from containing templates root to this part
  part.isAttached; // readonly boolean, denotes whether this part has been placed into the parent template fragment/parent dom
  part.firstNode(); // Node that begins this part
  part.lastNode(); // Node that ends this part...
  
  // Danger: dom manipulations below use carefully can do weird things like remove a part and then update the containing template which is undefined behavior...
  const frag = document.createDocumentFragment();
  const cursor = document.createComment("");
  frag.appendChild(cursor);
  //
  // all dom mutations will remove current part from dom if attached like the browsers dom api does for elements.
  part.appendTo(frag);
  part.insertAfter(cursor); 
  part.insertBefore(cursor);
  part.remove(); // moves the part back into it's private container fragment, used internally by apendTo, insertAfter, insertBefore.
};

// Arrays/iterables are valid PartValue and render templates, this uses repeat() internally
const nums = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
render(nums.map(num => {
  hello(num);
}));
render(hello(nums));

// Promises are valid PartValues, by default they will leave a HTML comment node where the part will update to whatever PartValue returned to resolve...
render(hello(new Promise(resolve => {
  const doWork = setTimeout(resolve("async!"), 1000);
})));

// until gives better support by allowing you to specify a default template while the promise resolves instead of a comment node
render(hello(until(new Promise(resolve => {
  const doWork = setTimeout(resolve("async!"), 1000);
},
"loading..." 
)));
```

## License

ulit is MIT licensed. See [LICENSE](LICENSE.md).
