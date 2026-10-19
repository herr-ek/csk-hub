import type { ComponentType } from "react"

/** The running app, opened from the demo slide. */
const DEMO_URL = "https://csk-jbibnde1g-herr-eks-projects.vercel.app/"

/** A music staff with a few notes, drawn behind the title and closing slides. */
function Staff() {
  const lines = [0, 1, 2, 3, 4]
  const notes = [
    { x: 980, y: 2 },
    { x: 1110, y: 1 },
    { x: 1240, y: 3 },
    { x: 1370, y: 1.5 }
  ]
  const gap = 28
  const top = 600

  return (
    <svg className="staff" viewBox="0 0 1600 900" aria-hidden="true">
      {lines.map((line) => (
        <line key={line} x1="0" x2="1600" y1={top + line * gap} y2={top + line * gap} />
      ))}
      {notes.map((note) => {
        const cy = top + note.y * gap
        return (
          <g key={note.x}>
            <ellipse cx={note.x} cy={cy} rx="19" ry="13" transform={`rotate(-20 ${note.x} ${cy})`} />
            <line className="stem" x1={note.x + 17} x2={note.x + 17} y1={cy - 4} y2={cy - 100} />
          </g>
        )
      })}
    </svg>
  )
}

function Title() {
  return (
    <div className="layout title">
      <Staff />
      <p className="kicker">Körmöte · 19 oktober 2026</p>
      <h1 className="hero">CSK Hub</h1>
      <p className="lead">Körens digitala samlingsplats</p>
      <p className="byline">Webmästeriet</p>
    </div>
  )
}

function Idea() {
  const pillars = [
    { name: "Nyheter", text: "Information från styrelsen, samlad i ett flöde." },
    { name: "Kalender", text: "Rep, gig och konserter - det som gäller dig." },
    { name: "Medlemmar", text: "Vem är vem, och ett sätt att nå varandra." }
  ]

  return (
    <div className="layout">
      <p className="kicker">Idén</p>
      <h2 className="statement">
        <em>Ett</em> ställe för <em>allt</em> som rör kören.
      </h2>
      <div className="pillars">
        {pillars.map((pillar) => (
          <div key={pillar.name} className="pillar">
            <h3>{pillar.name}</h3>
            <p>{pillar.text}</p>
          </div>
        ))}
      </div>
      <p className="note">
        Byggt för CSK - Manskören, Kammarkören och Damkören. Man blir inbjuden; ingen öppen registrering.
      </p>
    </div>
  )
}

function Today() {
  const features = [
    { name: "Nyheter", text: "Inlägg till alla medlemmar i ett gemensamt nyhetsflöde." },
    { name: "Meddelanden", text: "Skriv direkt till någon, eller i en gruppkonversation." },
    { name: "Medlemslista", text: "Sök bland medlemmarna och se kör, stämma och poster." },
    { name: "Min profil", text: "Din kör, din stämma, dina poster - och vad du kan sjunga." },
    { name: "Notiser", text: "Push-notiser direkt i mobilen när något händer." },
    { name: "Tryggt & personligt", text: "Passkey och tvåfaktor. Svenska, engelska, tyska. Mörkt läge." }
  ]

  return (
    <div className="layout">
      <p className="kicker">Läget idag</p>
      <h2>Det här finns redan</h2>
      <div className="cards">
        {features.map((feature) => (
          <div key={feature.name} className="card">
            <h3>{feature.name}</h3>
            <p>{feature.text}</p>
          </div>
        ))}
      </div>
      <p className="note">
        För admins/ansvariga: bjud in medlemmar (en i taget eller från en lista), hantera grupper och poster.
      </p>
    </div>
  )
}

function Events() {
  const points = [
    "Rep, gig, konserter, körmöten och sociala aktiviteter på ett ställe.",
    "Du ser det som gäller dig - din kör och din stämma.",
    "Inställt syns tydligt: överstruket, inte borttaget.",
    "Admins lägger in och publicerar evenemangen."
  ]
  const examples = [
    { day: "Mån 19 okt", time: "19:00", title: "Körmöte", place: "Ikväll!" },
    { day: "Ons 21 okt", time: "18:00", title: "Stämrep · KKB", place: "Inställt", cancelled: true },
    { day: "Tors 22 okt", time: "18:30", title: "Rep · KK", place: "Scania" },
    { day: "Lör 24 okt", time: "14:00", title: "Gig", place: "Mer info kommer" }
  ]

  return (
    <div className="layout split">
      <div>
        <p className="kicker">På gång just nu</p>
        <h2>Evenemang</h2>
        <ul className="points">
          {points.map((point) => (
            <li key={point}>{point}</li>
          ))}
        </ul>
      </div>
      <div className="mock" aria-label="Exempel på evenemangslistan">
        <p className="mock-heading">Kommande</p>
        {examples.map((event) => (
          <div key={event.title} className={event.cancelled ? "mock-row cancelled" : "mock-row"}>
            <span className="mock-day">{event.day}</span>
            <span className="mock-time">{event.time}</span>
            <span className="mock-title">{event.title}</span>
            <span className="mock-place">{event.place}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function Demo() {
  return (
    <div className="layout centered">
      <p className="kicker">
        <span className="live-dot" /> Demo
      </p>
      <h1 className="hero">Dags att titta!</h1>
      <a className="demo-link" href={DEMO_URL} target="_blank" rel="noreferrer">
        {DEMO_URL.replace("https://", "").replace(/\/$/, "")}
      </a>
    </div>
  )
}

function Next() {
  const soon = [
    { name: "Svara på evenemang", text: "Ja, Nej eller Kanske - direkt i appen." },
    { name: "Roller och behörigheter", text: "Dirigenter kan ändra sina rep, gigmästare sina gig - utan att vara admin." }
  ]
  const later = [
    "Fästa inlägg och markering för olästa",
    "Bilder i nyhetsinlägg",
    "Inlägg till en viss kör eller stämma",
    "Snabbmeny i mobilen"
  ]

  return (
    <div className="layout">
      <p className="kicker">Framåt</p>
      <h2>Det som kommer</h2>
      <div className="roadmap">
        <div>
          <h3 className="lane">Härnäst</h3>
          {soon.map((item) => (
            <div key={item.name} className="card">
              <h3>{item.name}</h3>
              <p>{item.text}</p>
            </div>
          ))}
        </div>
        <div>
          <h3 className="lane">Längre fram</h3>
          <ul className="points compact">
            {later.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  )
}

function Thanks() {
  return (
    <div className="layout title">
      <Staff />
      <h1 className="hero">Tack!</h1>
      <p className="lead">Frågor, tankar eller idéer? Hör av dig - gärna efteråt.</p>
    </div>
  )
}

export const slides: ComponentType[] = [Title, Idea, Today, Events, Demo, Next, Thanks]
