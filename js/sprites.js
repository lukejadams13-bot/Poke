// sprites.js — procedural drawings for creatures, the player, and NPCs.
// No image files: each species is drawn from its shape + colors, so adding a
// creature is just a new entry in data.js.

function drawMon(canvas, speciesId, facingLeft = false) {
  const ctx = canvas.getContext('2d');
  const S = canvas.width;
  ctx.clearRect(0, 0, S, S);
  const sp = SPECIES[speciesId];
  const scale = sp.stage === 2 ? 1 : 0.78; // evolved forms are bigger
  ctx.save();
  if (facingLeft) { ctx.translate(S, 0); ctx.scale(-1, 1); }
  ctx.translate(S * 0.46, S * 0.93);
  ctx.scale((S / 245) * scale, (S / 245) * scale);
  // Everything below is drawn in a ~240-unit box with the feet at y=0, facing right.

  const C = sp.color, A = sp.accent;
  const blob = (x, y, rx, ry, color, rot = 0) => { ctx.fillStyle = color; ctx.beginPath(); ctx.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2); ctx.fill(); };
  const tri = (pts, color) => { ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(...pts[0]); for (const p of pts.slice(1)) ctx.lineTo(...p); ctx.closePath(); ctx.fill(); };
  const outline = () => { ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 3; ctx.stroke(); };

  blob(0, 0, 70, 12, 'rgba(0,0,0,0.18)'); // shadow
  let eye; // [x, y, size] of the eye, set per shape

  switch (sp.shape) {
    case 'round':
      blob(-30, -8, 18, 10, A); blob(30, -8, 18, 10, A);          // feet
      tri([[-45, -95], [-30, -150], [-12, -105]], C);              // ears
      tri([[45, -95], [30, -150], [12, -105]], C);
      blob(0, -65, 62, 60, C); outline();
      blob(0, -45, 35, 28, A);                                     // belly
      eye = [22, -85, 10];
      break;
    case 'quad':
      blob(-80, -70, 28, 10, A, -0.6);                             // tail
      for (const lx of [-45, -20, 25, 50]) blob(lx, -14, 11, 18, C);
      blob(0, -55, 62, 36, C); outline();
      blob(5, -42, 40, 18, A);
      blob(62, -88, 38, 34, C); outline();                         // head
      tri([[45, -112], [50, -150], [70, -118]], C); tri([[72, -116], [88, -150], [92, -108]], C);
      blob(92, -80, 12, 9, A);                                     // snout
      eye = [72, -95, 8];
      break;
    case 'bird':
      blob(-10, -12, 8, 12, '#e0a030'); blob(15, -12, 8, 12, '#e0a030');
      tri([[-40, -70], [-95, -40], [-30, -45]], C);                // tail
      blob(0, -65, 50, 45, C); outline();
      tri([[-20, -90], [-90, -140], [-60, -60]], A);               // wing
      blob(10, -50, 28, 22, A);
      blob(38, -110, 32, 30, C); outline();                        // head
      tri([[66, -112], [92, -102], [66, -96]], '#f0b030');         // beak
      eye = [50, -116, 7];
      break;
    case 'serpent':
      for (let i = 0; i < 6; i++) {
        const x = -90 + i * 28, y = -25 - Math.sin(i * 0.9) * 22 - i * 6;
        blob(x, y, 26 - i * 0.5, 22, i % 2 ? C : A);
      }
      blob(80, -95, 38, 30, C); outline();                         // head
      tri([[60, -118], [55, -150], [80, -122]], A);                // fin/crest
      blob(105, -88, 14, 8, A);
      eye = [90, -102, 8];
      break;
    case 'bug':
      for (const lx of [-40, -10, 20]) { ctx.strokeStyle = '#333'; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(lx, -35); ctx.lineTo(lx - 12, 0); ctx.stroke(); }
      ctx.globalAlpha = 0.55;
      blob(-20, -110, 40, 24, A, -0.5); blob(15, -115, 38, 22, A, 0.4); // wings
      ctx.globalAlpha = 1;
      blob(-45, -50, 38, 30, C); outline();                         // abdomen
      blob(-45, -50, 34, 6, A);                                     // stripe
      blob(5, -60, 26, 24, C); outline();                           // thorax
      blob(48, -72, 28, 26, C); outline();                          // head
      ctx.strokeStyle = '#333'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(55, -95); ctx.quadraticCurveTo(70, -140, 90, -135); ctx.stroke();
      eye = [60, -78, 9];
      break;
    case 'humanoid':
    default:
      blob(-25, -12, 20, 14, A); blob(25, -12, 20, 14, A);          // feet
      blob(0, -75, 50, 60, C); outline();                           // torso
      blob(0, -65, 30, 34, A);
      blob(-55, -85, 16, 34, C, 0.3); blob(55, -85, 16, 34, C, -0.3); // arms
      blob(-62, -55, 16, 14, A); blob(62, -55, 16, 14, A);           // fists
      blob(8, -150, 36, 32, C); outline();                          // head
      tri([[-15, -170], [-5, -195], [10, -175]], A);
      eye = [24, -155, 8];
  }
  // Eye: white + pupil + glint. Same for every shape so they all read as "alive".
  blob(eye[0], eye[1], eye[2], eye[2] * 1.2, '#fff');
  blob(eye[0] + 2, eye[1] + 1, eye[2] * 0.6, eye[2] * 0.75, '#1a1a1a');
  blob(eye[0] + 4, eye[1] - 3, eye[2] * 0.22, eye[2] * 0.22, '#fff');
  ctx.restore();
}

// Overworld characters: simple top-down chibi. dir: 'up' | 'down' | 'left' | 'right'.
function drawPerson(ctx, sx, sy, S, dir, colors, step = 0) {
  const { shirt = '#d03030', hat = '#d03030', skin = '#f4c8a0', pants = '#304080' } = colors;
  const cx = sx + S / 2, bob = step ? Math.abs(Math.sin(step * Math.PI)) * 2 : 0;
  ctx.fillStyle = 'rgba(0,0,0,0.2)';
  ctx.beginPath(); ctx.ellipse(cx, sy + S * 0.92, S * 0.3, S * 0.1, 0, 0, Math.PI * 2); ctx.fill();
  // legs alternate while walking
  const legOff = step ? Math.sin(step * Math.PI * 2) * 3 : 0;
  ctx.fillStyle = pants;
  ctx.fillRect(cx - S * 0.18, sy + S * 0.68 - bob + legOff, S * 0.14, S * 0.22);
  ctx.fillRect(cx + S * 0.04, sy + S * 0.68 - bob - legOff, S * 0.14, S * 0.22);
  ctx.fillStyle = shirt;
  ctx.fillRect(cx - S * 0.24, sy + S * 0.42 - bob, S * 0.48, S * 0.3);
  ctx.fillStyle = skin;
  ctx.beginPath(); ctx.arc(cx, sy + S * 0.32 - bob, S * 0.2, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = hat;
  ctx.beginPath(); ctx.arc(cx, sy + S * 0.27 - bob, S * 0.21, Math.PI, 0); ctx.fill();
  // eyes / hat brim show facing direction
  ctx.fillStyle = '#222';
  const ey = sy + S * 0.34 - bob;
  if (dir === 'down') { ctx.fillRect(cx - 5, ey, 3, 4); ctx.fillRect(cx + 2, ey, 3, 4); ctx.fillStyle = hat; ctx.fillRect(cx - S * 0.22, sy + S * 0.25 - bob, S * 0.44, 3); }
  else if (dir === 'left') { ctx.fillRect(cx - 7, ey, 3, 4); ctx.fillStyle = hat; ctx.fillRect(cx - S * 0.32, sy + S * 0.25 - bob, S * 0.2, 3); }
  else if (dir === 'right') { ctx.fillRect(cx + 4, ey, 3, 4); ctx.fillStyle = hat; ctx.fillRect(cx + S * 0.12, sy + S * 0.25 - bob, S * 0.2, 3); }
  else { ctx.fillStyle = hat; ctx.beginPath(); ctx.arc(cx, sy + S * 0.3 - bob, S * 0.2, 0, Math.PI * 2); ctx.fill(); }
}
