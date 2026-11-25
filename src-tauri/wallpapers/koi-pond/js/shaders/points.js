/*
 * shaders/points.js — point sprites: small floating and underwater things.
 *
 * Defines: VS_PTS, FS_PTS
 *   uMode 0 floating specks (pollen, duckweed), 1 underwater motes, 2 rising bubbles, 3 fish food pellets
 */
"use strict";

/* ---------- small things: pollen, duckweed, motes, bubbles ---------- */
const VS_PTS = `
in vec4 aP; in vec4 aQ;     // food only. P: x, y, size, fade   Q: seed, soak (0 dry .. 1 sodden)
uniform int uMode;          // 0 floating specks, 1 underwater motes, 2 bubbles, 3 fish food
uniform float uPx;
uniform sampler2D uSurf;
out vec4 vD; out vec4 vE; out vec2 vW;
void main(){
  vec2 c; float size;
  vE = vec4(0.);
  if (uMode == 2){ c = aP.xy; size = aP.z; vD = vec4(aP.w, 0., 0., 0.); }
  else if (uMode == 3){
    // a pellet rides the water: it slides, tilts and bobs with the surface, so ripples and wakes shake it
    vec4 sf = DEC_S(texture(uSurf, toUV(aP.xy)));
    c = aP.xy - sf.xy*.010;
    size = aP.z*(1. + clamp(sf.z*.03, -.08, .08));
    float h = hash12(vec2(aQ.x*91.7, 3.1)), h2 = hash12(vec2(aQ.x*43.3, 9.4));
    float rot = h*6.2832 + clamp((sf.x - sf.y)*.8, -.5, .5) + .05*sin(uTime*.9 + aQ.x*30.);
    vD = vec4(aP.w, aQ.x, clamp(sf.w, 0., 1.2), aQ.y);
    vE = vec4(sf.xy, rot, 1. + .4*h2);                   // surface slope, rotation, how oval it is
  }
  else {
    float s = aP.z, t = uTime;
    float amp = uMode == 1 ? .05 : .025;
    c = aP.xy + amp*vec2(sin(t*(.05 + .07*fract(s*3.1)) + s*10.), cos(t*(.04 + .06*fract(s*5.3)) + s*7.));
    vec4 sf = DEC_S(texture(uSurf, toUV(c)));
    if (uMode == 0) c -= sf.xy*.012;
    size = aP.w < .5 ? 1.5 + 1.3*fract(s*13.) : 2.4 + 2.2*fract(s*7.);
    if (uMode == 1) size = 1.6 + 2.6*fract(s*11.);
    vD = vec4(aP.w, fract(s*17.), clamp(sf.w, 0., 1.2), 0.);
  }
  gl_Position = toClip(c);
  gl_PointSize = size*uPx;
  vW = c;
}
`;
const FS_PTS = `
in vec4 vD; in vec4 vE; in vec2 vW;
uniform int uMode;
out vec4 o;
void main(){
  vec2 pc = gl_PointCoord*2. - 1.;
  float r = length(pc);
  if (uMode == 2){
    float ring = ss(.55, .85, r)*ss(1., .88, r);
    float hl = ss(.45, .0, length(pc - vec2(-.3, -.35)));
    float a = (ring*.55 + hl*.8)*.9;
    vec3 Tf = exp(-SIG*vD.x*.18);
    vec3 c = vec3(.75, .9, .9)*(.6 + .6*hl)*Tf + WATER*(1. - Tf);
    a *= .35 + .65*(1. - vD.x);
    o = vec4(c*a, a);
    return;
  }
  if (uMode == 3){
    // A floating koi pellet: a matte, slightly lumpy brown cylinder sitting in the surface film.
    float fade = vD.x, seed = vD.y, sun = vD.z, soak = vD.w;
    vec2 slope = vE.xy;
    float rot = vE.z, asp = vE.w;
    float cr = cos(rot), sr = sin(rot);
    vec2 q = vec2(cr*pc.x + sr*pc.y, -sr*pc.x + cr*pc.y);          // pellet frame, long axis along x
    const float R0 = .36;
    float ang = atan(q.y, q.x);
    float rr = R0*(1. + .07*sin(ang*3. + seed*40.) + .045*sin(ang*5. + seed*71.)
                      + .05*(vnoise(vec2(ang*2. + seed*13., seed*9.)) - .5));   // uneven outline
    vec2 qs = q/vec2(sqrt(asp), 1./sqrt(asp));                      // oval
    float len = length(qs);
    float aa = fwidth(len)*1.1 + .004 + .012*soak;                 // a soggy pellet has a softer edge
    float cov = ss(rr + aa, rr - aa, len);

    // colour: dark brown to reddish tan, a few duller orange; grainy and pitted
    float tone = hash12(vec2(seed*57.3, 1.7));
    vec3 alb = tone < .5 ? mix(vec3(.21, .135, .085), vec3(.40, .26, .155), tone*2.)
                         : mix(vec3(.40, .26, .155), vec3(.58, .38, .24), (tone - .5)*2.);
    alb = mix(alb, vec3(.52, .28, .13), .22*hash12(vec2(seed*13.7, 4.4)));
    alb *= .70 + .38*vnoise(pc*17. + seed*50.) + .22*vnoise(pc*41. + seed*23.);
    alb *= 1. - .30*ss(.74, .84, vnoise(pc*30. + seed*70.));
    alb = mix(alb, alb*vec3(.62, .58, .55), soak*.7);              // water soaks in: darker, duller

    // shape: flat top, rounded rim; tilted a little by the waves. Matte, so no hotspot.
    vec2 nl = qs/rr;
    float dn = clamp(length(nl), 0., 1.);
    vec2 tl = nl*(.18 + .75*ss(.45, 1., dn));
    vec2 nw = vec2(cr*tl.x - sr*tl.y, sr*tl.x + cr*tl.y);
    vec3 N = normalize(vec3(nw - slope*2.2, .9));
    float ndl = max(dot(N, LSUN), 0.);
    vec3 pcol = lin(alb)*(AMB*1.7 + SUNC*1.5*sun*ndl);
    pcol += SUNC*pow(max(dot(N, normalize(LSUN + vec3(0., 0., 1.))), 0.), 10.)*.05*sun*(1. - soak*.6);
    pcol *= 1. - .30*ss(.65, 1., dn);                               // the rim sinks into the film
    pcol = mix(pcol, WATER*3., .14 + .10*soak);                     // partly submerged: a touch of water colour

    // water contact: soft dark meniscus, a faint sky glint on the sunny side, a faint shadow
    float e = (len - rr)/rr;
    float outside = 1. - cov;
    float rA = outside*(ss(.75, .04, e)*.26 + ss(.0, .05, e)*ss(.22, .07, e)*.22);
    vec2 od = pc/max(length(pc), 1e-3);
    float glint = outside*ss(.02, .08, e)*ss(.30, .12, e)*pow(max(dot(od, normalize(LSUN.xy)), 0.), 2.)*sun;
    vec3 rCol = mix(vec3(.008, .028, .026), vec3(.55, .72, .80), clamp(glint*1.6, 0., 1.));
    rA = min(rA + glint*.28, .7);
    float shA = outside*ss(rr*1.5, rr*.3, length(pc + LSUN.xy*.10))*.20;

    vec3 acc = vec3(.006, .02, .018)*shA; float A = shA;
    acc = acc*(1. - rA) + rCol*rA; A = A*(1. - rA) + rA;
    acc = acc*(1. - cov) + pcol*cov; A = A*(1. - cov) + cov;
    vec3 col = acc/max(A, 1e-3);
    A *= fade;
    o = vec4(grade(col, vW, gl_FragCoord.xy)*A, A);
    return;
  }
  float a = ss(1., .2, r);
  if (uMode == 1){ a *= .08 + .10*vD.y; o = vec4(vec3(.45, .58, .42)*(.5 + .5*vD.y)*a, a); return; }
  vec3 c;
  if (vD.x < .5){ c = vec3(.95, .92, .70); a *= .16 + .22*vD.y; }
  else { c = mix(vec3(.16, .32, .07), vec3(.30, .46, .11), vD.y); a = ss(1., .65, r)*.75; }
  o = vec4(grade(lin(c)*(AMB + SUNC*.9*vD.z), vW, gl_FragCoord.xy)*a, a);
}
`;
