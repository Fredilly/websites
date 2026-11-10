import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const html=readFileSync(new URL("../public/index.html",import.meta.url),"utf8");
test("clear offer and primary conversion route",()=>{
  assert.match(html,/Your website should/);
  assert.match(html,/win people over/);
  assert.match(html,/WEBSITE DESIGN &amp; DEVELOPMENT FOR BUSINESSES/);
  assert.match(html,/<a class="btn" href="#contact">Tell us about your project/);
});
test("portfolio proof is identified accurately",()=>{
  assert.match(html,/products and services we've built for ourselves, not client testimonials/);
  assert.match(html,/Private app, shown from a demo account/);
  assert.match(html,/scoop\.article6\.org/);
  assert.match(html,/carbon\.article6\.org/);
  assert.doesNotMatch(html,/5-star reviews|hundreds of clients|guaranteed leads/i);
});
test("visitor questions and secure CRM submission are preserved",()=>{
  assert.match(html,/id="questions-title"/);
  assert.match(html,/How much will my website cost/);
  assert.match(html,/What happens after I send the form/);
  assert.match(html,/id="intake" action="\/api\/contact" method="post"/);
  assert.match(html,/fetch\('\/api\/contact'/);
  assert.doesNotMatch(html,/action="mailto:/i);
  assert.match(html,/id="intake-feedback" role="status" aria-live="polite"/);
});
