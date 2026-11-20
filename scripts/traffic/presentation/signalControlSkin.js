import { UI } from "../ui/theme.js";

const ARROWS = {
  // Local frame: +x is the direction of travel, +y is the driver's right. Points in units of `size`.
  straight: [[-0.3, 0], [0.3, 0]],
  right: [[-0.3, -0.05], [0.05, -0.05], [0.05, 0.28]],
  left: [[-0.3, 0.05], [0.05, 0.05], [0.05, -0.28]],
  uturn: [[-0.3, -0.12], [0.1, -0.12], [0.1, 0.14], [-0.1, 0.14]],
};
const HEADS = { straight: [0.3, 0], right: [0.05, 0.28], left: [0.05, -0.28], uturn: [-0.1, 0.14] };

// How a signal control looks. Pure drawing: given a Phaser Graphics and a view
// state it paints one control and decides nothing about interaction. Replace
// this function (or its tokens in theme.js) to restyle controls; the layer,
// hit-testing and commands do not change.
//   view = { x, y, heading, turns, state (LightState), hovered, pending }
export function drawSignalControl(g, view, style = UI.signalControl) {
  const s = style.size;
  const h = s / 2;
  g.lineStyle(view.hovered ? style.borderHover : style.border, view.hovered ? style.colors.hover : style.colors.border, 1);
  g.beginFill(style.colors.fill[view.state], 1);
  g.drawRoundedRect(view.x - h, view.y - h, s, s, 5);
  g.endFill();

  // Movement glyph, oriented to the approach's heading
  const cos = Math.cos(view.heading);
  const sin = Math.sin(view.heading);
  const at = ([lx, ly]) => [view.x + (lx * cos - ly * sin) * s, view.y + (lx * sin + ly * cos) * s];
  g.lineStyle(3, style.colors.glyph, 1);
  for (const turn of view.turns) {
    const pts = (ARROWS[turn] ?? ARROWS.straight).map(at);
    g.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]);
    const [hx, hy] = at(HEADS[turn] ?? HEADS.straight);
    g.lineStyle(0);
    g.beginFill(style.colors.glyph, 1);
    g.drawCircle(hx, hy, 7);
    g.endFill();
    g.lineStyle(3, style.colors.glyph, 1);
  }

  // A command has been issued but the simulation has not applied it yet (paused)
  if (view.pending) {
    g.lineStyle(2, style.colors.pending, 0.9);
    g.drawCircle(view.x, view.y, s + 8);
  }
}
