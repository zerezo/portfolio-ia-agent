import { CalendarDays, GraduationCap, MapPin, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { formatMonth } from "../format.js";
import { initials } from "./AppShell.jsx";

const EMOJI = { running: "🏃", cycling: "🚴", football: "⚽" };
const emoji = (text) => EMOJI[text.toLowerCase()] ?? "✨";

// "IndraMind Cybersecurity (Indra Group, formerly SIA)" -> "IndraMind Cybersecurity".
const shortName = (text) => text.split(" (")[0];
const year = (value) => (value ? value.slice(0, 4) : "now");

function Tile({ title, className, children }) {
  return (
    <section
      className={cn(
        "flex min-h-0 flex-col gap-2 overflow-hidden rounded-2xl border bg-card/70 p-3.5 backdrop-blur",
        className,
      )}
    >
      {title && (
        <h3 className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
          {title}
        </h3>
      )}
      {children}
    </section>
  );
}

const Chip = ({ children, className }) => (
  <li
    className={cn(
      "rounded-full bg-muted px-2.5 py-0.5 text-xs whitespace-nowrap",
      className,
    )}
  >
    {children}
  </li>
);

// CV en formato bento: lo esencial en tarjetas pequeñas que caben en una pantalla. El detalle
// (descripciones, certificaciones completas) lo da el asistente.
export default function CvPanel({ profile, onOpenContact }) {
  const { name, headline, location } = profile.profile;
  const current = profile.experience.find((e) => !e.end);
  const degree = profile.education[0];

  return (
    <div
      className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2 md:h-full md:grid-rows-[auto_auto_minmax(0,1fr)_auto]"
      aria-label="CV"
    >
      <Tile className="col-span-full flex-row items-center gap-4">
        <span
          className="grid size-14 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-primary to-brand-2 text-lg font-bold text-white md:hidden"
          aria-hidden="true"
        >
          {initials(name)}
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="bg-gradient-to-r from-primary to-brand-2 bg-clip-text text-2xl font-bold tracking-tight text-transparent">
            {name}
          </h2>
          <p className="truncate text-muted-foreground" title={headline}>
            {shortName(headline.split("|")[0].trim())}
          </p>
          <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
            <MapPin className="size-3" /> {location.split(",")[0]}, Spain
          </p>
        </div>
        <div className="hidden shrink-0 flex-col gap-2 sm:flex">
          <Button size="sm" className="rounded-full" onClick={onOpenContact}>
            <CalendarDays /> Book a call
          </Button>
          <Button asChild size="sm" variant="outline" className="rounded-full">
            <a href={profile.contact.linkedin} target="_blank" rel="noreferrer">
              LinkedIn ↗
            </a>
          </Button>
        </div>
      </Tile>

      {current && (
        <Tile title="Now">
          <p className="font-semibold leading-snug">{current.role}</p>
          <p className="text-xs text-muted-foreground">
            {shortName(current.company)} · since {formatMonth(current.start)}
          </p>
        </Tile>
      )}
      {degree && (
        <Tile title="Studied">
          <p
            className="flex items-start gap-1.5 font-semibold leading-snug"
            title={degree.degree}
          >
            <GraduationCap className="mt-0.5 size-4 shrink-0 text-primary" />
            <span className="line-clamp-2">
              {degree.degree.replace(/^Bachelor's Degree in /, "")}
            </span>
          </p>
          <p className="text-xs text-muted-foreground">
            {shortName(degree.institution)} · {year(degree.end)}
          </p>
        </Tile>
      )}

      <Tile title="Journey">
        <ol className="flex flex-col gap-2">
          {profile.experience.map((e) => (
            <li key={`${e.company}-${e.role}`} className="flex gap-2">
              <span
                className={cn(
                  "mt-1.5 size-1.5 shrink-0 rounded-full bg-muted-foreground/40",
                  !e.end && "bg-primary",
                )}
              />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium" title={e.role}>
                  {e.role}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {shortName(e.company)} · {years(e.start, e.end)}
                </p>
              </div>
            </li>
          ))}
        </ol>
      </Tile>

      <Tile title="Building">
        <ul className="flex flex-col gap-3">
          {profile.projects.map((p) => (
            <li key={p.name} className="flex flex-col gap-0.5">
              <div className="flex items-baseline gap-2">
                <span
                  className="min-w-0 flex-1 truncate font-medium"
                  title={p.name}
                >
                  {p.url ? (
                    <a
                      className="hover:text-primary hover:underline"
                      href={p.url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {p.name}
                    </a>
                  ) : (
                    p.name
                  )}
                </span>
                <span
                  className={cn(
                    "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium",
                    p.status === "in progress"
                      ? "bg-primary/15 text-primary"
                      : "bg-muted text-muted-foreground",
                  )}
                >
                  {p.status === "in progress" ? "building" : "shipped"}
                </span>
              </div>
              <p className="line-clamp-2 text-xs text-muted-foreground">
                {p.description}
              </p>
            </li>
          ))}
        </ul>
      </Tile>

      <Tile title="Skills & certs">
        <ul className="flex flex-wrap gap-1.5">
          {profile.skills.map((s) => (
            <Chip key={s}>{s.replace(/ \(.*\)$/, "")}</Chip>
          ))}
        </ul>
        <p className="mt-auto flex items-center gap-1 text-xs text-muted-foreground">
          <Sparkles className="size-3 text-brand-2" />
          {profile.certifications.length} certifications, incl.{" "}
          {profile.certifications[0].name.split(":")[0]}
        </p>
      </Tile>

      <Tile title="Off the clock">
        <ul className="flex flex-wrap gap-1.5">
          {profile.interests.map((i) => (
            <Chip key={i.topic}>
              {emoji(i.topic)} {i.topic}
            </Chip>
          ))}
          {profile.languages.map((l) => (
            <Chip key={l.language}>
              💬 {l.language} · {l.level.split(",")[0]}
            </Chip>
          ))}
        </ul>
      </Tile>
    </div>
  );
}
