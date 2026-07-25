/**
 * Animated money printer: a green printer endlessly printing ETH bills.
 * Pure SVG + CSS keyframes (see globals.css), no video or JS animation.
 */
export default function MoneyPrinter() {
  return (
    <div className="printer-stage" aria-hidden="true">
      <svg
        className="printer-svg"
        viewBox="0 0 400 430"
        xmlns="http://www.w3.org/2000/svg"
        role="img"
        aria-label="Money printer printing ETH bills"
      >
        <defs>
          <linearGradient id="bodyGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#00e006" />
            <stop offset="1" stopColor="#009a04" />
          </linearGradient>
          <clipPath id="slotClip">
            {/* only show bills once they pass the output slot */}
            <rect x="0" y="250" width="400" height="180" />
          </clipPath>
          <g id="ethBill">
            <rect
              x="110"
              y="252"
              width="180"
              height="110"
              rx="10"
              fill="#dffbe5"
              stroke="#0b4d1e"
              strokeWidth="2"
            />
            <rect
              x="120"
              y="262"
              width="160"
              height="90"
              rx="6"
              fill="none"
              stroke="#7fce97"
              strokeWidth="1.5"
              strokeDasharray="4 4"
            />
            {/* ETH mark */}
            <polygon points="200,275 224,310 200,323 176,310" fill="#0b4d1e" />
            <polygon
              points="176,316 200,330 224,316 200,344"
              fill="#177a34"
            />
            <circle cx="133" cy="275" r="4" fill="#7fce97" />
            <circle cx="267" cy="275" r="4" fill="#7fce97" />
            <circle cx="133" cy="339" r="4" fill="#7fce97" />
            <circle cx="267" cy="339" r="4" fill="#7fce97" />
          </g>
        </defs>

        {/* bills, clipped so they emerge from the slot */}
        <g clipPath="url(#slotClip)">
          <g className="printer-bill">
            <use href="#ethBill" />
          </g>
          <g className="printer-bill b2">
            <use href="#ethBill" />
          </g>
          <g className="printer-bill b3">
            <use href="#ethBill" />
          </g>
        </g>

        {/* printer machine */}
        <g className="printer-body">
          {/* steam puffs */}
          <circle className="printer-steam" cx="96" cy="96" r="9" fill="#2e5c3d" />
          <circle className="printer-steam s2" cx="118" cy="88" r="6" fill="#2e5c3d" />
          <circle className="printer-steam s3" cx="84" cy="82" r="5" fill="#2e5c3d" />

          {/* paper feed on top */}
          <rect x="148" y="58" width="104" height="34" rx="4" fill="#c9f9d6" />

          {/* Robin Hood cap with feather (same paths as the brand icon, scaled) */}
          <g transform="translate(-22.7,-15.1) scale(0.87)">
            <path d="M302,92 C308,64 326,44 350,36 C354,54 344,78 318,94 Z" fill="#f0b429" />
            <path d="M304,94 L350,36" fill="none" stroke="#b8860b" strokeWidth="3" strokeLinecap="round" />
            <path d="M320,74 L333,67 M312,84 L326,77" fill="none" stroke="#b8860b" strokeWidth="2.5" strokeLinecap="round" />
            <path d="M198,88 C202,60 224,40 252,34 C290,38 316,62 320,88 Q258,98 198,88 Z" fill="#0d7f2c" />
            <path d="M252,34 C290,38 316,62 320,88 Q286,94 254,92 C248,72 248,52 252,34 Z" fill="#065c1e" opacity="0.85" />
            <path d="M252,36 C246,54 244,72 246,90" fill="none" stroke="#04401a" strokeWidth="4" strokeLinecap="round" opacity="0.7" />
            <path d="M174,78 C180,94 212,102 256,102 C300,102 332,94 338,78 C346,92 322,112 256,112 C190,112 166,92 174,78 Z" fill="#05541c" />
          </g>

          <rect x="132" y="86" width="136" height="36" rx="10" fill="#046b21" />

          {/* main body */}
          <rect x="70" y="110" width="260" height="140" rx="22" fill="url(#bodyGrad)" />
          <rect x="70" y="110" width="260" height="34" rx="17" fill="#0fd414" opacity="0.55" />

          {/* face details */}
          <circle className="printer-led" cx="298" cy="150" r="7" fill="#c9f9d6" />
          <rect x="88" y="142" width="96" height="16" rx="8" fill="#04140a" opacity="0.35" />
          <rect x="88" y="168" width="60" height="16" rx="8" fill="#04140a" opacity="0.25" />

          {/* gold chain — it lives on Robinhood Chain, so it wears one */}
          <path
            d="M86,150 Q200,240 314,150"
            fill="none"
            stroke="#8a6a10"
            strokeWidth="3"
            opacity="0.6"
          />
          <g fill="none" stroke="#f7c948" strokeWidth="5">
            <circle cx="86" cy="150" r="7" />
            <circle cx="108.8" cy="166.2" r="7" />
            <circle cx="131.6" cy="178.8" r="7" />
            <circle cx="154.4" cy="187.8" r="7" />
            <circle cx="177.2" cy="193.2" r="7" />
            <circle cx="200" cy="195" r="7" />
            <circle cx="222.8" cy="193.2" r="7" />
            <circle cx="245.6" cy="187.8" r="7" />
            <circle cx="268.4" cy="178.8" r="7" />
            <circle cx="291.2" cy="166.2" r="7" />
            <circle cx="314" cy="150" r="7" />
          </g>
          {/* ETH medallion */}
          <circle cx="200" cy="213" r="19" fill="#f7c948" stroke="#a87b12" strokeWidth="3" />
          <circle cx="200" cy="213" r="14" fill="#ffe071" />
          <polygon points="200,203 209.5,214.5 200,219.5 190.5,214.5" fill="#0b4d1e" />
          <polygon points="190.5,217.5 200,222.5 209.5,217.5 200,226" fill="#177a34" />

          {/* output slot */}
          <rect x="96" y="234" width="208" height="16" rx="8" fill="#04140a" />

          {/* feet */}
          <rect x="92" y="250" width="34" height="14" rx="6" fill="#063d15" />
          <rect x="274" y="250" width="34" height="14" rx="6" fill="#063d15" />
        </g>

        {/* BRRR */}
        <text
          className="brrr-label"
          x="316"
          y="86"
          fontFamily="inherit"
          fontWeight="800"
          fontSize="26"
          fill="#00c805"
          letterSpacing="1"
        >
          BRRR
        </text>
      </svg>
    </div>
  );
}
