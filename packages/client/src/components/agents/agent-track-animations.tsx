import type { CSSProperties, ReactNode } from "react";
import type { AgentTrackStatus } from "../../stores/agent.store";

// ──────────────────────────────────────────────
// Per-agent thematic animations for the AgentTrackBar.
//
// Each built-in agent gets a bespoke micro-animation that hints at what the
// agent actually does — a quill for the Prose Guardian, an equalizer for the
// Music DJ, a radar sweep for Knowledge Retrieval, and so on. Unknown/custom
// agents fall back to a neutral orbiting-dots loop.
//
// Design constraints (see DESIGN.md — "The Velvet Game Console"):
//   • The stage is a 44px circle (~36px usable). Everything is centered via
//     absolute positioning inside a `.at-anim` root.
//   • Motion uses transform/opacity only (60fps-safe), never layout props.
//   • `running` plays fast + confident; `queued` plays slow + idle so the two
//     states read differently at a glance without relying on colour alone.
//   • Every animated element's *static* pose (with `animation: none`) is a
//     sensible, visible shape, so `prefers-reduced-motion` degrades cleanly.
// ──────────────────────────────────────────────

// Virtual agent identifiers — kept in sync with use-generate.ts. Prefixed
// with double underscores so they can never collide with real agent types.
export const MAIN_GENERATION_AGENT_TYPE = "__main_generation__";
export const TRANSLATION_AGENT_TYPE = "__translation__";
export const VIRTUAL_AGENT_TYPES = new Set<string>([MAIN_GENERATION_AGENT_TYPE, TRANSLATION_AGENT_TYPE]);

// ──────────────────────────────────────────────
// Keyframes
// ──────────────────────────────────────────────
export const AGENT_TRACK_KEYFRAMES = `
/* shared */
@keyframes atk-spin { from { transform: rotate(0); } to { transform: rotate(360deg); } }
@keyframes atk-spin-rev { from { transform: rotate(0); } to { transform: rotate(-360deg); } }
@keyframes atk-pulse { 0%,100% { transform: scale(0.62); opacity:0.55; } 50% { transform: scale(1); opacity:1; } }
@keyframes atk-blink { 0%,100% { opacity:0.2; } 50% { opacity:1; } }

/* prose-guardian — quill wiggle + twinkle */
@keyframes atk-quill { 0%,100% { transform: translate(-3px,3px) rotate(-8deg); } 50% { transform: translate(3px,-3px) rotate(6deg); } }
@keyframes atk-twinkle { 0%,100% { transform: scale(0.2); opacity:0; } 50% { transform: scale(1); opacity:1; } }

/* continuity — interlocking links tug */
@keyframes atk-link-a { 0%,100% { transform: translateX(-2px); } 50% { transform: translateX(1.5px); } }
@keyframes atk-link-b { 0%,100% { transform: translateX(2px); } 50% { transform: translateX(-1.5px); } }

/* director — clapperboard snap */
@keyframes atk-clap { 0%,60%,100% { transform: rotate(0); } 20%,40% { transform: rotate(-32deg); } }

/* echo-chamber — reaction bubbles float up */
@keyframes atk-echo { 0% { transform: translateY(8px) scale(0.3); opacity:0; } 40% { opacity:1; } 100% { transform: translateY(-9px) scale(0.9); opacity:0; } }

/* expression — emotion crossfade */
@keyframes atk-emote-a { 0%,40% { opacity:1; } 60%,100% { opacity:0; } }
@keyframes atk-emote-b { 0%,40% { opacity:0; } 60%,100% { opacity:1; } }

/* quest — checkmark pop */
@keyframes atk-check { 0%,100% { transform: scale(0.4); opacity:0.2; } 45%,70% { transform: scale(1); opacity:1; } }

/* background — sun rises behind ridge */
@keyframes atk-rise { 0%,100% { transform: translateY(7px); opacity:0.4; } 50% { transform: translateY(-2px); opacity:1; } }

/* character-tracker — heartbeat (double thump) */
@keyframes atk-beat { 0%,100% { transform: scale(0.72); } 15% { transform: scale(1); } 30% { transform: scale(0.78); } 45% { transform: scale(0.95); } 60% { transform: scale(0.72); } }

/* persona-stats — bars fill */
@keyframes atk-bar-a { 0%,100% { transform: scaleY(0.3); } 50% { transform: scaleY(1); } }
@keyframes atk-bar-b { 0%,100% { transform: scaleY(0.9); } 50% { transform: scaleY(0.4); } }
@keyframes atk-bar-c { 0%,100% { transform: scaleY(0.5); } 50% { transform: scaleY(0.85); } }

/* custom-tracker — gauge needle sweep */
@keyframes atk-needle { 0%,100% { transform: rotate(-52deg); } 50% { transform: rotate(52deg); } }

/* illustrator — brush stroke sweep */
@keyframes atk-brush { 0% { transform: translate(-7px,5px) rotate(-40deg); } 50% { transform: translate(6px,-5px) rotate(-40deg); } 100% { transform: translate(-7px,5px) rotate(-40deg); } }
@keyframes atk-dab { 0%,100% { transform: scale(0.3); opacity:0; } 55% { transform: scale(1); opacity:0.9; } }

/* lorebook-keeper — page flip */
@keyframes atk-flip { 0% { transform: rotateY(0deg); } 55%,100% { transform: rotateY(-160deg); } }

/* card-evolution-auditor — DNA helix */
@keyframes atk-dna-a { 0%,100% { transform: translateY(-6px) scale(0.6); opacity:0.5; } 50% { transform: translateY(6px) scale(1); opacity:1; } }
@keyframes atk-dna-b { 0%,100% { transform: translateY(6px) scale(1); opacity:1; } 50% { transform: translateY(-6px) scale(0.6); opacity:0.5; } }

/* combat — crossed swords clash */
@keyframes atk-clash-a { 0%,100% { transform: rotate(45deg) translateY(2px); } 45%,55% { transform: rotate(45deg) translateY(-2px); } }
@keyframes atk-clash-b { 0%,100% { transform: rotate(-45deg) translateY(2px); } 45%,55% { transform: rotate(-45deg) translateY(-2px); } }
@keyframes atk-flash { 0%,40%,100% { transform: scale(0); opacity:0; } 50% { transform: scale(1); opacity:0.9; } }

/* html — brackets converge + caret blink */
@keyframes atk-brk-l { 0%,100% { transform: translateX(-2px); } 50% { transform: translateX(-6px); } }
@keyframes atk-brk-r { 0%,100% { transform: translateX(2px); } 50% { transform: translateX(6px); } }

/* spotify — equalizer */
@keyframes atk-eq-a { 0%,100% { transform: scaleY(0.3); } 50% { transform: scaleY(1); } }
@keyframes atk-eq-b { 0%,100% { transform: scaleY(1); } 50% { transform: scaleY(0.35); } }
@keyframes atk-eq-c { 0%,100% { transform: scaleY(0.55); } 50% { transform: scaleY(0.9); } }
@keyframes atk-eq-d { 0%,100% { transform: scaleY(0.85); } 50% { transform: scaleY(0.45); } }

/* knowledge-router — packet travels a branch */
@keyframes atk-route { 0% { transform: translate(0,0); opacity:0; } 15% { opacity:1; } 100% { transform: translate(11px,-9px); opacity:0; } }
@keyframes atk-route2 { 0% { transform: translate(0,0); opacity:0; } 15% { opacity:1; } 100% { transform: translate(11px,9px); opacity:0; } }

/* haptic — vibration jitter + waves */
@keyframes atk-jitter { 0%,100% { transform: translateX(-1.5px); } 25% { transform: translateX(1.5px); } 50% { transform: translateX(-1px); } 75% { transform: translateX(1px); } }
@keyframes atk-haptic-wave { 0% { transform: scale(0.4); opacity:0.7; } 100% { transform: scale(1.7); opacity:0; } }

/* cyoa — path forks */
@keyframes atk-fork-a { 0% { transform: translate(0,0); opacity:0; } 20% { opacity:1; } 100% { transform: translate(9px,-8px); opacity:0.2; } }
@keyframes atk-fork-b { 0% { transform: translate(0,0); opacity:0; } 20% { opacity:1; } 100% { transform: translate(9px,8px); opacity:0.2; } }

/* main-generation — typing dots */
@keyframes atk-type { 0%,80%,100% { transform: translateY(0); opacity:0.35; } 40% { transform: translateY(-4px); opacity:1; } }

/* fallback — orbiting dots */
@keyframes atk-orbit { from { transform: rotate(0); } to { transform: rotate(360deg); } }

@media (prefers-reduced-motion: reduce) {
  .at-anim * { animation: none !important; }
}
`;

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────

// Duration in seconds: running is brisk, queued idles ~2.5× slower.
function dur(base: number, status: AgentTrackStatus): string {
  return `${(status === "running" ? base : base * 2.5).toFixed(2)}s`;
}

const STAGE: CSSProperties = { position: "absolute", inset: 0 };

// Absolute-centered element helper. `x`/`y` nudge from the centre in px.
function centered(size: number, x = 0, y = 0): CSSProperties {
  return {
    position: "absolute",
    left: "50%",
    top: "50%",
    width: size,
    height: size,
    marginLeft: -size / 2 + x,
    marginTop: -size / 2 + y,
  };
}

type Renderer = (status: AgentTrackStatus, color: string) => ReactNode;

// ──────────────────────────────────────────────
// Individual agent animations
// ──────────────────────────────────────────────

// prose-guardian — a quill scratching, with a twinkle of polish.
const proseGuardian: Renderer = (status, color) => (
  <div style={STAGE}>
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ ...centered(20), animation: `atk-quill ${dur(0.9, status)} ease-in-out infinite` }}
    >
      <path d="M20 4c-4 0-9 3-12 8-1.5 2.5-2.5 5-3 8 3-0.5 5.5-1.5 8-3 5-3 8-8 8-12z" />
      <path d="M5 20c2-4 5-7 9-9" />
    </svg>
    <span
      style={{
        ...centered(4, 9, -8),
        borderRadius: "9999px",
        backgroundColor: color,
        animation: `atk-twinkle ${dur(1.1, status)} ease-in-out infinite`,
      }}
    />
  </div>
);

// continuity — two chain links tugging against each other.
const continuity: Renderer = (status, color) => (
  <div style={STAGE}>
    <span
      style={{
        ...centered(11, -4),
        border: `2px solid ${color}`,
        borderRadius: "9999px",
        animation: `atk-link-a ${dur(1, status)} ease-in-out infinite`,
      }}
    />
    <span
      style={{
        ...centered(11, 4),
        border: `2px solid ${color}`,
        borderRadius: "9999px",
        animation: `atk-link-b ${dur(1, status)} ease-in-out infinite`,
      }}
    />
  </div>
);

// director — a clapperboard snapping shut.
const director: Renderer = (status, color) => (
  <div style={STAGE}>
    <span style={{ ...centered(20, 0, 4), height: 12, marginTop: -2, border: `2px solid ${color}`, borderRadius: 2 }} />
    <div
      style={{
        ...centered(20, 0, -6),
        height: 6,
        transformOrigin: "left center",
        animation: `atk-clap ${dur(1.4, status)} ease-in-out infinite`,
      }}
    >
      <span style={{ position: "absolute", inset: 0, border: `2px solid ${color}`, borderRadius: 2 }} />
      {[0, 7, 14].map((x) => (
        <span
          key={x}
          style={{
            position: "absolute",
            top: 1,
            left: x + 1,
            width: 3,
            height: 3,
            background: color,
            transform: "rotate(45deg)",
          }}
        />
      ))}
    </div>
  </div>
);

// echo-chamber — reaction bubbles floating upward.
const echoChamber: Renderer = (status, color) => (
  <div style={STAGE}>
    {[
      { x: -6, d: 0 },
      { x: 5, d: 0.35 },
      { x: -1, d: 0.7 },
    ].map(({ x, d }, i) => (
      <span
        key={i}
        style={{
          ...centered(6, x, 6),
          borderRadius: "9999px 9999px 9999px 2px",
          backgroundColor: color,
          animation: `atk-echo ${dur(1.4, status)} ease-out infinite`,
          animationDelay: `${d * (status === "running" ? 1 : 2.5)}s`,
        }}
      />
    ))}
  </div>
);

// expression — a face crossfading between two emotions.
const expression: Renderer = (status, color) => {
  const d = dur(1.6, status);
  const mouth = (path: string, anim: string): ReactNode => (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="2"
      strokeLinecap="round"
      style={{ ...centered(22), animation: `${anim} ${d} ease-in-out infinite` }}
    >
      <circle cx="8.5" cy="10" r="1.2" fill={color} stroke="none" />
      <circle cx="15.5" cy="10" r="1.2" fill={color} stroke="none" />
      <path d={path} />
    </svg>
  );
  return (
    <div style={STAGE}>
      {mouth("M8 15c1.4 1.6 6.6 1.6 8 0", "atk-emote-a")}
      {mouth("M8 16c1.4 -1.6 6.6 -1.6 8 0", "atk-emote-b")}
    </div>
  );
};

// quest — an objective checkbox ticking complete.
const quest: Renderer = (status, color) => (
  <div style={STAGE}>
    <span style={{ ...centered(18), border: `2px solid ${color}`, borderRadius: 4, opacity: 0.55 }} />
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ ...centered(16), animation: `atk-check ${dur(1.3, status)} ease-in-out infinite` }}
    >
      <path d="M5 13l4 4L19 6" />
    </svg>
  </div>
);

// background — a sun cresting a horizon ridge.
const background: Renderer = (status, color) => (
  <div style={{ ...STAGE, overflow: "hidden", borderRadius: "9999px" }}>
    <span
      style={{
        ...centered(12, 0, 3),
        borderRadius: "9999px",
        backgroundColor: color,
        animation: `atk-rise ${dur(1.8, status)} ease-in-out infinite`,
      }}
    />
    <span
      style={{ position: "absolute", left: 4, right: 4, bottom: 9, height: 2, backgroundColor: color, opacity: 0.85 }}
    />
  </div>
);

// character-tracker — a heartbeat with a double thump.
const characterTracker: Renderer = (status, color) => (
  <div style={STAGE}>
    <svg
      viewBox="0 0 24 24"
      fill={color}
      style={{ ...centered(20), animation: `atk-beat ${dur(1, status)} ease-in-out infinite` }}
    >
      <path d="M12 21s-7-4.6-9.3-9C1 8.6 2.5 5 6 5c2 0 3.2 1.2 4 2.3C10.8 6.2 12 5 14 5c3.5 0 5 3.6 3.3 7-2.3 4.4-9.3 9-9.3 9z" />
    </svg>
  </div>
);

// persona-stats — animated stat bars.
const personaStats: Renderer = (status, color) => {
  const bars = ["atk-bar-a", "atk-bar-b", "atk-bar-c"];
  return (
    <div style={STAGE}>
      {bars.map((anim, i) => (
        <span
          key={i}
          style={{
            position: "absolute",
            left: `calc(50% + ${(i - 1) * 6}px)`,
            bottom: 12,
            marginLeft: -2,
            width: 4,
            height: 14,
            borderRadius: 2,
            backgroundColor: color,
            transformOrigin: "bottom",
            animation: `${anim} ${dur(1.1, status)} ease-in-out infinite`,
            animationDelay: `${i * 0.12}s`,
          }}
        />
      ))}
    </div>
  );
};

// custom-tracker — a gauge needle sweeping across a dial.
const customTracker: Renderer = (status, color) => (
  <div style={STAGE}>
    <span
      style={{
        ...centered(20, 0, 4),
        height: 10,
        marginTop: -1,
        borderTop: `2px solid ${color}`,
        borderLeft: `2px solid ${color}`,
        borderRight: `2px solid ${color}`,
        borderTopLeftRadius: 12,
        borderTopRightRadius: 12,
        opacity: 0.5,
      }}
    />
    <div
      style={{
        position: "absolute",
        left: "50%",
        top: "calc(50% + 6px)",
        width: 2,
        height: 11,
        marginLeft: -1,
        transformOrigin: "bottom center",
        backgroundColor: color,
        borderRadius: 2,
        animation: `atk-needle ${dur(1.3, status)} ease-in-out infinite`,
      }}
    />
    <span style={{ ...centered(4, 0, 6), borderRadius: "9999px", backgroundColor: color }} />
  </div>
);

// illustrator — a brush sweeping strokes with a colour dab.
const illustrator: Renderer = (status, color) => (
  <div style={STAGE}>
    <div style={{ ...centered(14), animation: `atk-brush ${dur(1.3, status)} ease-in-out infinite` }}>
      <span
        style={{
          position: "absolute",
          left: 5,
          top: 0,
          width: 3,
          height: 11,
          borderRadius: 2,
          backgroundColor: color,
          opacity: 0.6,
        }}
      />
      <span
        style={{
          position: "absolute",
          left: 4,
          top: 10,
          width: 5,
          height: 5,
          borderRadius: "2px 2px 4px 4px",
          backgroundColor: color,
        }}
      />
    </div>
    <span
      style={{
        ...centered(5, 8, 7),
        borderRadius: "9999px",
        backgroundColor: color,
        animation: `atk-dab ${dur(1.3, status)} ease-out infinite`,
      }}
    />
  </div>
);

// lorebook-keeper — a book with a flipping page.
const lorebookKeeper: Renderer = (status, color) => (
  <div style={{ ...STAGE, perspective: 60 }}>
    <span
      style={{
        ...centered(9, -5),
        height: 16,
        marginTop: -8,
        border: `2px solid ${color}`,
        borderRadius: "2px 0 0 2px",
        opacity: 0.55,
      }}
    />
    <span
      style={{
        ...centered(9, 5),
        height: 16,
        marginTop: -8,
        border: `2px solid ${color}`,
        borderRadius: "0 2px 2px 0",
        opacity: 0.55,
      }}
    />
    <span
      style={{
        position: "absolute",
        left: "50%",
        top: "50%",
        width: 9,
        height: 16,
        marginTop: -8,
        transformOrigin: "left center",
        backgroundColor: color,
        opacity: 0.9,
        borderRadius: "0 2px 2px 0",
        animation: `atk-flip ${dur(1.5, status)} ease-in-out infinite`,
      }}
    />
  </div>
);

// card-evolution-auditor — a DNA double helix twisting.
const cardEvolutionAuditor: Renderer = (status, color) => {
  const d = dur(1.4, status);
  return (
    <div style={STAGE}>
      {[-8, -3, 2, 7].map((x, i) => (
        <span
          key={`a${x}`}
          style={{
            position: "absolute",
            left: `calc(50% + ${x}px)`,
            top: "50%",
            width: 4,
            height: 4,
            marginLeft: -2,
            marginTop: -2,
            borderRadius: "9999px",
            backgroundColor: color,
            animation: `atk-dna-a ${d} ease-in-out infinite`,
            animationDelay: `${i * 0.14}s`,
          }}
        />
      ))}
      {[-8, -3, 2, 7].map((x, i) => (
        <span
          key={`b${x}`}
          style={{
            position: "absolute",
            left: `calc(50% + ${x}px)`,
            top: "50%",
            width: 4,
            height: 4,
            marginLeft: -2,
            marginTop: -2,
            borderRadius: "9999px",
            backgroundColor: color,
            animation: `atk-dna-b ${d} ease-in-out infinite`,
            animationDelay: `${i * 0.14}s`,
          }}
        />
      ))}
    </div>
  );
};

// combat — two swords clashing with a spark.
const combat: Renderer = (status, color) => (
  <div style={STAGE}>
    <span
      style={{
        ...centered(2, 0),
        height: 18,
        marginTop: -9,
        backgroundColor: color,
        borderRadius: 2,
        transformOrigin: "center",
        animation: `atk-clash-a ${dur(1.1, status)} ease-in-out infinite`,
      }}
    />
    <span
      style={{
        ...centered(2, 0),
        height: 18,
        marginTop: -9,
        backgroundColor: color,
        borderRadius: 2,
        transformOrigin: "center",
        animation: `atk-clash-b ${dur(1.1, status)} ease-in-out infinite`,
      }}
    />
    <span
      style={{
        ...centered(6, 0, -1),
        borderRadius: "9999px",
        backgroundColor: color,
        animation: `atk-flash ${dur(1.1, status)} ease-out infinite`,
      }}
    />
  </div>
);

// html — angle brackets converging around a blinking caret.
const html: Renderer = (status, color) => (
  <div style={STAGE}>
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ ...centered(22), animation: `atk-brk-l ${dur(1.2, status)} ease-in-out infinite` }}
    >
      <path d="M9 7l-5 5 5 5" />
    </svg>
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ ...centered(22), animation: `atk-brk-r ${dur(1.2, status)} ease-in-out infinite` }}
    >
      <path d="M15 7l5 5-5 5" />
    </svg>
    <span
      style={{
        ...centered(2, 0),
        height: 10,
        marginTop: -5,
        backgroundColor: color,
        animation: `atk-blink ${dur(0.8, status)} step-end infinite`,
      }}
    />
  </div>
);

// spotify / Music DJ — a live equalizer.
const spotify: Renderer = (status, color) => {
  const bars = ["atk-eq-a", "atk-eq-b", "atk-eq-c", "atk-eq-d"];
  return (
    <div style={STAGE}>
      {bars.map((anim, i) => (
        <span
          key={i}
          style={{
            position: "absolute",
            left: `calc(50% + ${(i - 1.5) * 5}px)`,
            bottom: 13,
            marginLeft: -1.5,
            width: 3,
            height: 13,
            borderRadius: 2,
            backgroundColor: color,
            transformOrigin: "bottom",
            animation: `${anim} ${dur(0.85, status)} ease-in-out infinite`,
            animationDelay: `${i * 0.08}s`,
          }}
        />
      ))}
    </div>
  );
};

// knowledge-retrieval — a radar sweep over a search field.
const knowledgeRetrieval: Renderer = (status, color) => (
  <div style={STAGE}>
    <span style={{ ...centered(20), border: `2px solid ${color}`, borderRadius: "9999px", opacity: 0.4 }} />
    <span style={{ ...centered(11), border: `1.5px solid ${color}`, borderRadius: "9999px", opacity: 0.3 }} />
    <div style={{ ...centered(20), animation: `atk-spin ${dur(1.3, status)} linear infinite` }}>
      <span
        style={{
          position: "absolute",
          left: "50%",
          top: "50%",
          width: 9,
          height: 2,
          marginTop: -1,
          transformOrigin: "left center",
          backgroundColor: color,
          borderRadius: 2,
        }}
      />
    </div>
    <span style={{ ...centered(4), borderRadius: "9999px", backgroundColor: color }} />
  </div>
);

// knowledge-router — a packet forking down two branches.
const knowledgeRouter: Renderer = (status, color) => (
  <div style={STAGE}>
    <span style={{ ...centered(6, -6), borderRadius: "9999px", backgroundColor: color, opacity: 0.85 }} />
    <span
      style={{
        ...centered(4, -6),
        borderRadius: "9999px",
        backgroundColor: color,
        animation: `atk-route ${dur(1.2, status)} ease-out infinite`,
      }}
    />
    <span
      style={{
        ...centered(4, -6),
        borderRadius: "9999px",
        backgroundColor: color,
        animation: `atk-route2 ${dur(1.2, status)} ease-out infinite`,
        animationDelay: `${status === "running" ? 0.2 : 0.5}s`,
      }}
    />
    <span style={{ ...centered(4, 7, -7), borderRadius: "9999px", border: `1.5px solid ${color}` }} />
    <span style={{ ...centered(4, 7, 7), borderRadius: "9999px", border: `1.5px solid ${color}` }} />
  </div>
);

// haptic — a buzzing core with radiating vibration waves.
const haptic: Renderer = (status, color) => (
  <div style={STAGE}>
    {[0, 1].map((i) => (
      <span
        key={i}
        style={{
          ...centered(12),
          border: `1.5px solid ${color}`,
          borderRadius: "9999px",
          animation: `atk-haptic-wave ${dur(1.1, status)} ease-out infinite`,
          animationDelay: `${i * (status === "running" ? 0.4 : 1)}s`,
        }}
      />
    ))}
    <div style={{ ...centered(8), animation: `atk-jitter ${dur(0.5, status)} linear infinite` }}>
      <span style={{ position: "absolute", inset: 0, borderRadius: 3, backgroundColor: color }} />
    </div>
  </div>
);

// cyoa — a branching path splitting into choices.
const cyoa: Renderer = (status, color) => (
  <div style={STAGE}>
    <span style={{ ...centered(5, -7), borderRadius: "9999px", backgroundColor: color }} />
    <span
      style={{
        ...centered(4, -7),
        borderRadius: "9999px",
        backgroundColor: color,
        animation: `atk-fork-a ${dur(1.3, status)} ease-out infinite`,
      }}
    />
    <span
      style={{
        ...centered(4, -7),
        borderRadius: "9999px",
        backgroundColor: color,
        animation: `atk-fork-b ${dur(1.3, status)} ease-out infinite`,
      }}
    />
    <span style={{ ...centered(5, 7, -8), borderRadius: "9999px", border: `1.5px solid ${color}` }} />
    <span style={{ ...centered(5, 7, 8), borderRadius: "9999px", border: `1.5px solid ${color}` }} />
  </div>
);

// world-state — a globe with an orbiting satellite (time/weather/place).
const worldState: Renderer = (status, color) => (
  <div style={STAGE}>
    <span style={{ ...centered(15), border: `2px solid ${color}`, borderRadius: "9999px", opacity: 0.85 }} />
    <span
      style={{
        ...centered(15),
        borderLeft: `1.5px solid ${color}`,
        borderRight: `1.5px solid ${color}`,
        borderRadius: "9999px",
        opacity: 0.5,
        transform: "translate(-50%,-50%) scaleX(0.45)",
      }}
    />
    <span
      style={{
        ...centered(15),
        borderTop: `1.5px solid ${color}`,
        borderBottom: `1.5px solid ${color}`,
        borderRadius: "9999px",
        opacity: 0.5,
        transform: "translate(-50%,-50%) scaleY(0.45)",
      }}
    />
    <div style={{ ...centered(22), animation: `atk-spin ${dur(1.6, status)} linear infinite` }}>
      <span
        style={{
          position: "absolute",
          left: "50%",
          top: 0,
          width: 4,
          height: 4,
          marginLeft: -2,
          borderRadius: "9999px",
          backgroundColor: color,
        }}
      />
    </div>
  </div>
);

// about-me-keeper — a persona card with a pulsing profile ring.
const aboutMeKeeper: Renderer = (status, color) => (
  <div style={STAGE}>
    <span
      style={{
        ...centered(18),
        animation: `atk-pulse ${dur(1.4, status)} ease-in-out infinite`,
        border: `1.5px solid ${color}`,
        borderRadius: "9999px",
        opacity: 0.5,
      }}
    />
    <span style={{ ...centered(6, 0, -3), borderRadius: "9999px", backgroundColor: color }} />
    <span
      style={{
        ...centered(12, 0, 6),
        height: 7,
        marginTop: -1,
        borderRadius: "9999px 9999px 0 0",
        backgroundColor: color,
      }}
    />
  </div>
);

// ──────────────────────────────────────────────
// Virtual agents (main-response generation, translation)
// ──────────────────────────────────────────────

// main-generation — the model "typing" the visible reply.
const mainGeneration: Renderer = (status, color) => (
  <div style={STAGE}>
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ ...centered(22, 0, -1), opacity: 0.9 }}
    >
      <path d="M21 15a2 2 0 0 1-2 2H8l-4 3V5a2 2 0 0 1 2-2h13a2 2 0 0 1 2 2z" />
    </svg>
    {[-4, 0, 4].map((x, i) => (
      <span
        key={x}
        style={{
          ...centered(3, x, -1),
          borderRadius: "9999px",
          backgroundColor: color,
          animation: `atk-type ${dur(1.1, status)} ease-in-out infinite`,
          animationDelay: `${i * 0.16}s`,
        }}
      />
    ))}
  </div>
);

// translation — a glyph morphing between scripts (A ⇄ 文).
const translation: Renderer = (status, color) => {
  const d = dur(1.8, status);
  return (
    <div style={STAGE}>
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke={color}
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ ...centered(20), animation: `atk-emote-a ${d} ease-in-out infinite` }}
      >
        <path d="M6 19l6-14 6 14" />
        <path d="M8.5 14h7" />
      </svg>
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ ...centered(20), animation: `atk-emote-b ${d} ease-in-out infinite` }}
      >
        <path d="M4 7h16" />
        <path d="M12 4v3" />
        <path d="M6 11h12v9H6z" />
        <path d="M12 11v9" />
      </svg>
    </div>
  );
};

// fallback — three orbiting dots for unknown / custom agents.
const fallback: Renderer = (status, color) => (
  <div style={STAGE}>
    {[0, 1, 2].map((i) => (
      <div
        key={i}
        style={{
          position: "absolute",
          left: "50%",
          top: "50%",
          width: 0,
          height: 0,
          animation: `atk-orbit ${dur(0.95, status)} linear infinite`,
          animationDelay: `${i * (status === "running" ? 0.32 : 0.8)}s`,
        }}
      >
        <span
          style={{
            position: "absolute",
            left: -2.5,
            top: -11,
            width: 5,
            height: 5,
            borderRadius: "9999px",
            backgroundColor: color,
          }}
        />
      </div>
    ))}
  </div>
);

// ──────────────────────────────────────────────
// Registry
// ──────────────────────────────────────────────

const AGENT_ANIMATIONS: Record<string, Renderer> = {
  "prose-guardian": proseGuardian,
  continuity,
  director,
  "echo-chamber": echoChamber,
  expression,
  quest,
  background,
  "character-tracker": characterTracker,
  "persona-stats": personaStats,
  "custom-tracker": customTracker,
  illustrator,
  "lorebook-keeper": lorebookKeeper,
  "card-evolution-auditor": cardEvolutionAuditor,
  combat,
  html,
  spotify,
  "knowledge-retrieval": knowledgeRetrieval,
  "knowledge-router": knowledgeRouter,
  haptic,
  cyoa,
  "world-state": worldState,
  "about-me-keeper": aboutMeKeeper,
  [MAIN_GENERATION_AGENT_TYPE]: mainGeneration,
  [TRANSLATION_AGENT_TYPE]: translation,
};

/**
 * Render the thematic animation for an agent. Only `queued`/`running` states
 * animate; `completed`/`failed` are drawn as static glyphs by the caller.
 * Unknown agent types (custom agents) fall back to orbiting dots.
 */
export function renderAgentAnimation(agentType: string, status: AgentTrackStatus, color: string): ReactNode {
  if (status !== "queued" && status !== "running") return null;
  const renderer = AGENT_ANIMATIONS[agentType] ?? fallback;
  return renderer(status, color);
}
