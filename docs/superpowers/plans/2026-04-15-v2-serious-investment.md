# v2 Serious Investment Plan

**Goal:** Close the gap with html.to.design for real-world websites. Focus on visible fidelity.

## Features (priority order)

### 1. Flex → Auto Layout (biggest layout win)
In renderer's `page.evaluate` enrich pass, for every DOM element with `display: flex`:
- Add to tree node: `layoutMode` ('HORIZONTAL'|'VERTICAL' from flex-direction)
- Add `itemSpacing` from `gap` / `column-gap` / `row-gap`
- Add `paddingTop/Right/Bottom/Left` from padding
- Add `primaryAxisAlignItems` from `justify-content`
- Add `counterAxisAlignItems` from `align-items`

Match DOM to tree nodes via rect overlap (same technique as naming enrich).

### 2. Wrapper Collapse (reduce noise)
After engine runs, walk tree and collapse frames where:
- No fills, no strokes, no effects
- Has exactly 1 child
- Child's rect is contained within parent's rect (within 2px tolerance)

Lift the child to the parent's position (child.x += parent.x).

### 3. Font Rasterization (pixel-perfect text)
For text elements where the font-family isn't available in Figma, screenshot the element via Playwright:
```js
const shot = await element.screenshot({ omitBackground: true })
```
Replace the TEXT node with a FRAME containing IMAGE fill. Keep position and size.

Detect "unavailable" fonts by:
- Keeping a list of known-unavailable families (custom fonts, unusual names)
- OR: test-load in Figma plugin, fall back to rasterized version on failure

Decision: rasterize if family is NOT in: Inter, Arial, Helvetica, Roboto, Times New Roman, Georgia, Courier New, Verdana, Tahoma, system-ui, or a Google Font. Keep editable otherwise.

Simpler initial heuristic: if fontFamily contains any of these markers → custom, rasterize:
- Any of: "Rektorat", "GT Standard", "Swiss", "Custom", or anything not in Figma's default system fonts + Google Fonts top 50.

Actually simplest: rasterize ALWAYS for text on the page as an option (user toggle: "editable text" vs "pixel-perfect"). For v2, default to rasterizing when font isn't one of the top 30 Google Fonts.

## Scope of this plan

Implement 1, 2, 3 in one push. Deploy. Arthur tests.

## Task list

- [ ] Task A: Flex detection in renderer enrich pass
- [ ] Task B: Wrapper collapse in renderer post-pass
- [ ] Task C: Font rasterization with Playwright element.screenshot
- [ ] Commit each task separately, push, redeploy VPS, user tests
