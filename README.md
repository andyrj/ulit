# ulit
[![npm version](https://badge.fury.io/js/ulit.svg)](https://badge.fury.io/js/ulit)
[![Codacy Badge](https://api.codacy.com/project/badge/Grade/74420ad6de824a64a06235becc1810c2)](https://www.codacy.com/app/andyrjohnson82/ulit?utm_source=github.com&amp;utm_medium=referral&amp;utm_content=andyrj/ulit&amp;utm_campaign=Badge_Grade)
[![Codacy Badge](https://api.codacy.com/project/badge/Coverage/74420ad6de824a64a06235becc1810c2)](https://www.codacy.com/app/andyrjohnson82/ulit?utm_source=github.com&utm_medium=referral&utm_content=andyrj/ulit&utm_campaign=Badge_Coverage)
[![Build Status](https://travis-ci.org/andyrj/ulit.svg?branch=master)](https://travis-ci.org/andyrj/ulit)

*WIP* Tagged Template Literal html template library.  Inspired by lit-html/hyperHTML.

TODO:
1. Finish typescript conversion and cleanup
2. Correct repeat()
3. get test coverage up to 100/100

## Why another tagged template literal library?
"I cannot understand what I cannot build." - Feynman

Started this from a desire to see how hard it would be to improve upon the implementations of lit-html and hyperHTML, focusing on feature density and utilizing the platform, but abandoning support for legacy browsers to use the latest features without transpiling to es5 (instead targeting Chrome, Firefox, Safari, Edge latest versions).

## What was the result?

Rough parity with lit-html + lit-extended on features and general api setup.

Pros:
* Transparent svg support - (no need for special svg tagged template function)
* Simple depth first search walkDOM(fn) avoids using slow TreeWalker and allows for simple tracking of path during recursive dfs.
* SSR support via serializable part paths.  This uses followPath(Array<Number|String>), which handles most of the setup work, and it can be pre-rendered down to static html that can be delivered to the client and hydrated, bypassing the more expensive process required if a serialized template is not present in the dom.
* By using "{{}}" for attributes and \<\!\-\-\{\{\}\}\-\-\> for part placeholders, this library doesn't need to use regex, doesn't force quotes on attributes in templates and can be generally simpler.

Cons:
* No plan to support partial parts. i.e.
  ```js
  // DO NOT DO THIS
  bar => html`<div style="{foo: ${bar}}">boom</div>`
  ```
  ```js
  // DO NOT DO THIS
  fail => html`<div id=prefix-${fail}-suffix></div>`
  ```
  you should instead always write your templates to replace the whole property/attribute as a single variable i.e. 
  ```js
  // DO THIS INSTEAD
  good => html`<div id=${good}></div>`
  ```
* Style tags within html tagged template literals are not supported initially, will need to add a style tagged template literal helper for this purpose, can be made outside of core.
```js
// basic idea if someone feels like implementing something
html`${style`...`}<div></div>`; // template out -> <style>...</style><div></div> 
```

## How can I use it?

You shouldn't yet, the version checked into npm is working except for repeat/iterables/arrays, but there are many bug fixes in this rewrite I just haven't quite finished yet...

Once it's finished being built/debugged you can install/use it as normal.

### Install
```
npm install --save ulit
```

#### API Dump
```js
// repeat is used for rendering keyed lists of dom nodes
// until allows you to conditionally load a template that is replaced upon promise completion (code-splitting, fetch, etc...)
import { directive, html, render, repeat, until } from "ulit";

// "components" are just template functions
const hello = subject => html`<h1>hello ${subject}</h1>`;

// render defaults to rendering to document.body if no other container is provided
render(hello("world"), document.body);
document.body.innerHTML === "<h1>hello world</h1>"; // true

// calling render multiple times on the same container will update the current template in place if possible or replace it.
render(hello("internet"));
document.body.innerHTML === "<h1>hello internet</h1>"; // true

// Build your own directive to extend ulit...
// the example below passthroughDirective is a dummy directive example that is equivalent to just passing the value to the part
// in the template expressions.
const passthroughDirective = value => directive(part => {
  part.update(value);
});

render(html`<h1>${passthroughDirective("pass through example...")}</h1>`);
document.body.innerHTML === "<h1>pass through example...</h1>"; // true

// Example Part API brain dump
const partApiDirective = directive(part => {
  // update part with a new PartValue
  part.update("test");

  // parts have a dispose event so that you can clean up anything your directives create on dispose...
  // parts are disposed when templates replace one another and have differing static parts, or when a part changes from a directive to another valid PartValue
  const handler = handlerPart => {
    // normally clean up whatever LUT/cache you have seems like Map<part, ...> is pretty useful inside directives
  };
  part.addDisposer(handler);
  part.removeDisposer(handler);

  // parts and templates share a common key of "target" which is a DomTarget that is used to store
  // the edges of the part/template
  part.target.first(); // Node that begins this part
  part.target.last(); // Node that ends this part...
  part.path; // readonly Array<string | number>, the path from containing templates root to this part
  part.target.remove(); // moves the part out of the dom and into a document fragment.
});

// Arrays/iterables are valid PartValue and render templates, this uses repeat() internally
const nums = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
render(nums.map(num => {
  hello(num);
}));
document.body.innerHTML === "<h1>hello 0</h1><h1>hello 1</h1>..."; //true
render(hello(nums));
document.body.innerHTML === "<h1>hello 012345678910</h1>"; // true NOTE: each number would be it's own textNode in this case...

// Promises are valid PartValues, by default they will leave the previous part value in place initially, and update to what is resolved...
render(hello(new Promise(resolve => {
  const doWork = setTimeout(resolve("async!"), 1000);
})));
// initially
document.body.innerHTML === "<h1>hello 012345678910</h1>"; // true
setTimeout(() => document.body.innerHTML === "<h1>hello async!</h1>", 1001); // true

// until gives better support by allowing you to specify a default template while the promise resolves instead of a comment node
render(
  hello(until(new Promise(resolve => {
    const doWork = setTimeout(resolve("async!"), 1000);
  },
  "loading..."
  )))
);
document.body.innerHTML === "<h1>hello loading...</h1>"; //true
setTimeout(() => document.body.innerHTML === "<h1>hello async!</h1>", 1001); // true

// events
const eventTemplate = html`<button onclick=${e => console.log(e)}>click me</button>`;
document.body.innerHTML === "<button>click me</button>"; // true

// nested templates
const nested = hello(hello("nested"));
render(nested);
document.body.innerHTML === "<h1>hello <h1>hello nested</h1></h1>"; // true

```

## License

ulit is MIT licensed. See [LICENSE](LICENSE.md).
