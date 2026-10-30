"""Draft re-categorizer. Reads records.json (never writes to it). Rules + hand decisions, no AI calls.
Usage: python -X utf8 -I classify.py <records.json> <out_dir>
"""
import json, re, sys, collections as C

SRC, OUT = sys.argv[1], sys.argv[2]
data = json.load(open(SRC, encoding="utf8"))
recs = data["records"]

# ---- the 8 artist categories and the one tag we write for each ----
CAT_TAG = {"music": "music", "comedy": "comedy", "dance": "dance", "theater": "theater", "writing": "literary",
           "visual": "visual", "film": "film", "craft": "craft", "model": "model", "photographer": "photographer", "videographer": "videographer", "crew": "crew", "singer": "singer", "poet": "poet"}
TAG_CAT = {"music": "music", "sound": "music", "comedy": "comedy", "dance": "dance", "theater": "theater",
           "performance": "theater", "performing_arts": "theater", "literary": "writing", "writing": "writing",
           "visual": "visual", "sculpture": "visual", "lens-based": "visual", "curatorial": "visual",
           "textiles": "visual", "film": "film", "media": "film", "digital": "film", "transmission": "film",
           "technology": "film", "craft": "craft", "design": "craft", "architecture": "craft", "model": "model", "photographer": "photographer", "videographer": "videographer", "crew": "crew", "singer": "singer", "poet": "poet"}
ALL = "all"

def D(*cats):  # list of category names -> list of tags (or ['all'])
    if cats == (ALL,): return [ALL]
    out = []
    for c in cats:
        t = CAT_TAG[c]
        if t not in out: out.append(t)
    return out

def old_cats(tags):
    s = set()
    for t in tags:
        if t == ALL: s.add(ALL)
        elif t in TAG_CAT: s.add(TAG_CAT[t])
    return s

# ---- word lists for guessing the artist type of a title ----
INFER = [
    ("music", r"music|choir|chorale|chorus|\bsinging\b|sing-?along|\bsing\b|jazz|drum|guitar|band\b|violin|piano|ukulele|song|harmon|orchestra|dj\b"),
    ("dance", r"dance|dancing|swing|ballroom|movement|salsa|tango"),
    ("theater", r"acting|actor|improv|theat|puppet|stage|cabaret"),
    ("writing", r"writ|poet|story|storytell|verse|memoir|essay|novel|book"),
    ("visual", r"paint|draw|watercolor|sketch|print|photo|camera|portrait|mural|mixed media|collage|marbling|figure|color|sculpt|illustrat|calligraph|art making"),
    ("craft", r"weav|crochet|knit|stitch|embroider|ceramic|wheel|pottery|wood|craft|quill|basket|sew|glass|needle|terrarium|cutting board|pens|wreath|ornament"),
    ("film", r"film|video|movie|cinema|screen"),
]
def infer(title):
    t = title.lower(); out = []
    for c, rx in INFER:
        if re.search(rx, t): out.append(c)
    return out

# ---- results ----
res = {}
def put(i, typ, sub, disc, conf, why):
    res[i] = dict(opportunity_type=typ, subtype=sub, disciplines=disc if isinstance(disc, list) else D(*disc),
                  category_confidence=conf, category_reason=why)

def T(i): return (recs[i]["title"] or "")

# ======================= hand decisions for the curated listings =======================
H = "high"; M = "medium"; L = "low"
gallery = lambda i, d=("visual",), c=H, why="Call to show visual work (exhibition / juried / members / market).": put(i, "open_call", "gallery_submission", d, c, why)
festcall = lambda i, d, c=H, why="Submissions or applications to a festival.": put(i, "open_call", "festival", d, c, why)
perfcall = lambda i, d, c=M, why="Apply or propose to perform or present work; not an audition.": put(i, "open_call", "performance_call", d, c, why)
audition = lambda i, d, c=H, why="Audition notice.": put(i, "open_call", "audition", d, c, why)
casting = lambda i, d=("theater",), c=H, why="Casting notice for a film, TV or video shoot.": put(i, "open_call", "casting_call", d, c, why)

for i in (11, 34, 37, 483, 484, 1088): gallery(i)
gallery(9, c=M, why="apexart open call: exhibition proposals; closest kind is gallery submission.")
gallery(10, why="Artists submit a postcard-size work to a benefit exhibition.")
gallery(25); gallery(485); gallery(1113); gallery(1114)
gallery(35, c=M, why="Open call for images shown in an exhibition (Islip Arts Council).")
gallery(36, c=M, why="Open call for images shown in an exhibition (Islip Arts Council).")
gallery(487, c=M, why="Annual community art benefit open call (artworks shown and sold).")
gallery(493, ("visual", "craft"), M, "Call to make wreaths displayed by NYC Parks; works like an exhibition call.")
gallery(662, c=M, why="Market vendor applications for artists (holiday market).")
gallery(1079, c=M, why="Flat-file submissions for an art space.")
gallery(1081, c=M, why="East End Arts members show (per its web address); listing says 'all' artists.")
gallery(1241, c=M, why="'Call for art' for a group exhibition or project.")
gallery(1386, c=M, why="'Call for art' for a group exhibition or project.")
gallery(12, ("craft", "visual"), M, "Design open call for a building (a commission); closest kind is gallery/visual call.")
put(12, "open_call", "commission", D("craft", "visual"), M, "Design open call for a new building; a commission.")
put(2, "residency", "residency", D(ALL), H, "Studio residency open call.")

festcall(482, ("film",), H, "Film festival call for entries.")
festcall(669, ("film", "dance"), H, "Dance on Camera Festival submissions (dance films), not an audition.")
festcall(670, ("film", "dance"), H, "Dance on Camera Festival student-program submissions (dance films), not an audition.")
festcall(692, ("dance", "film"), H, "92NY Future Dance Festival: dance film applications.")
festcall(693, ("dance",), H, "92NY Future Dance Festival: live performance applications.")
festcall(698, ("film",), H, "Red Hook Brooklyn Film Festival submissions; was tagged dance.")
festcall(699, ("dance",), M, "Footprints Dance Festival listing; looks like a call for dancers, guessed from the title.")
festcall(704, ("dance",), M, "WestFest 2027 applications; name says fest, content not stated.")
festcall(1392, ("writing", "theater"), M, "Queens Storytelling Festival open call.")
put(562, "event", "show", D("dance"), H, "West Coast Swing weekend festival to attend; no submissions, so Other events.")
put(1090, "event", "show", D("dance", "music"), M, "Folk festival to attend (Hostos Center); no submissions, so Other events.")

for i in (26, 27): perfcall(i, ("music", "theater"), H)
perfcall(30, ("dance",)); perfcall(31, ("dance", "music", "writing", "visual"))
perfcall(663, ("music", "theater")); perfcall(666, ("comedy",), H, "Comedians apply to perform on stand-up shows.")
perfcall(672, ("dance",)); perfcall(691, ("dance",)); perfcall(694, ("dance",), L, "Solo performance license; unclear, guessed.")
perfcall(697, ("dance",), M, "Call for Queens choreographers (Dance Astoria 2027); could be a festival, check.")
perfcall(700, ("dance",)); perfcall(702, ("dance",)); perfcall(703, ("dance", "film"), M)
perfcall(1116, ("music", "theater", "dance"), H, "Culture Lab LIC performance proposals.")

for i in (671, 673, 675, 677, 681, 688, 689, 690, 661, 650, 1119, 1121, 1122): audition(i, ("dance",))
audition(29, ("dance", "theater"), M, "Dancers for a stage play.")
audition(674, ("theater", "dance"), M, "Actor for a ballet production.")
audition(680, ("dance",), M, "Dancers for a holiday showcase.")
audition(682, ("dance",), M, "Dance company open call, treated as audition.")
audition(683, ("dance",), M, "Dancer wanted for Nutcracker performances.")
audition(1120, ("dance", "theater"))
casting(684, ("theater", "dance"), M, "Unpaid film-school production casting; was tagged dance.")
casting(686, ("dance",), M, "Dancers for a concept reel casting.")
put(676, "open_call", "general_call", D("dance", "film"), L, "Booking page for dance filmmakers and composers; not clear what is on offer.")
put(678, "open_call", "general_call", D("dance"), L, "'Get a solo from Gallim'; unclear whether class or audition.")
put(685, "open_call", "general_call", D("dance"), L, "Unclear (title is about AI and dance); guessed.")
put(687, "open_call", "performance_call", D("dance", "theater"), L, "Seeking disabled performing artists; unclear what for.")
put(679, "open_call", "paid_gig", D("dance"), H, "Paid go-go dancers for a nightclub.")
put(496, "open_call", "paid_gig", D("dance", "theater"), H, "Paid event performers.")
put(497, "open_call", "paid_gig", D("dance"), H, "Paid dancers for events.")
put(701, "event", "class", D("dance"), H, "Butoh classes, listed wrongly as an open call.")
put(498, "job", "teaching_artist", D("dance"), H, "Dance teaching artist job.")
put(1523, "job", "teaching_artist", D("music"), M, "Guitar teacher wanted.")
put(1524, "job", "teaching_artist", D("music"), M, "Voice teacher wanted.")
put(21, "grant", "fellowship", D("visual"), M, "A.I.R. Gallery fellowship (also includes a show).")
put(38, "open_call", "competition", D("writing"), M, "Poet Laureate application; an honor, closest kind is competition.")
put(486, "open_call", "competition", D("visual"), H, "Painting award.")
put(547, "open_call", "competition", D("writing", "theater"), M, "Poetry slam where poets sign up to compete.")
put(548, "open_call", "competition", D("writing", "theater"), M, "Poetry slam where poets sign up to compete.")
put(1076, "open_call", "commission", D("visual"), H, "Federal public-art commission.")
put(1117, "open_call", "commission", D("visual"), H, "Mural proposals, paid.")
put(481, "open_call", "casting_call", D("theater"), H, "TV pilot day-player casting.")
put(1278, "open_call", "casting_call", D("theater"), M, "Performer wanted by a film company.")
put(1279, "open_call", "audition", D("theater"), M, "Casting actors for a performative project.")
put(1277, "open_call", "general_call", D("theater"), M, "Backstage crew call, not acting.")
put(1242, "open_call", "writing_submission", D("writing"), H, "Call for essays and criticism.")
put(1243, "open_call", "writing_submission", D("writing"), M, "Paid critical-review writing opportunity.")
put(1245, "open_call", "writing_submission", D(ALL), L, "Journal feature call; may be a paid-promotion scheme.")
put(1240, "open_call", "general_call", D(ALL), L, "Pay-to-publish style offer; may not be a real opportunity.")
put(1246, "open_call", "general_call", D(ALL), L, "Professional-development offer; may not be a real opportunity.")
put(1244, "open_call", "general_call", D(ALL), M, "Panelist call (a paid review role).")
put(1452, "open_call", "general_call", D(ALL), M, "A survey of artists, not an opportunity.")
put(1239, "open_call", "paid_gig", D("theater"), L, "Activity host or performer; unclear.")
put(695, "residency", "residency", D("dance"), M, "Winter residency application.")
put(696, "residency", "residency", D("dance"), M, "Artist residency program.")
put(1525, "open_call", "general_call", D("music"), L, "Young-artist chamber music program; unclear if class or application.")
put(1516, "open_call", "audition", D("theater"), M, "Theatre company call (Scratch Off 2026).")
put(1036, "open_call", "audition", D("theater"), M, "Theme-park show auditions; 'Fest' is only the show's name.")
put(1037, "open_call", "audition", D("theater", "comedy"), H, "Sketch revue audition.")
put(1513, "open_call", "paid_gig", D("dance", "theater"), H, "Paid event performers.")
put(1514, "open_call", "paid_gig", D("theater"), M, "Emcee/host for a dance competition tour.")
put(1515, "open_call", "paid_gig", D("theater"), M, "Character performers for a brand.")
put(1517, "open_call", "paid_gig", D("dance"), M, "Paid brand ambassadors with dance background.")
put(1519, "open_call", "audition", D("music", "dance", "theater"), M, "Cruise-ship performer auditions.")
put(1489, "open_call", "audition", D("theater", "music"), H, "Actor and violinist wanted for a play.")
put(1521, "open_call", "paid_gig", D("music", "theater"), M, "Cabaret performers for a show.")
put(1522, "open_call", "paid_gig", D("music"), H, "Music director for a showcase.")
put(653, "open_call", "audition", D("theater"), M, "Lottery auditions for The Actors' Center.")

# grants / residencies / jobs defaults and fixes
put(18, "grant", "grant", D("theater"), M, "Source says performing arts; sibling grants are 'all'. Kept, please check.")
put(7, "grant", "grant", D("theater"), M, "Source says performing arts; sibling LMCC grants are 'all'. Kept, please check.")
put(13, "grant", "fellowship", D("visual"), H, "Research fellowship; 'research' is not an app category.")
put(495, "grant", "fellowship", D("visual"), M, "Research fellowship; 'research' is not an app category.")
put(1039, "grant", "fellowship", D("visual"), M, "Research fellowship; 'research' is not an app category.")
put(23, "residency", "residency", D("craft", "visual"), H, "Architecture/design/visual residency.")
put(579, "residency", "residency", D("dance"), M, "Technical residency (closed), was filed as a workshop.")
put(655, "event", "class", D("visual", "writing"), M, "Certificate program at a school; a class, not a fellowship.")
put(1115, "residency", "residency", D(ALL), M, "Residency for several arts; kept as 'all'.")
for i in (627, 629, 630, 633): put(i, "residency", "residency", D("theater"), H, "Theater residency.")
for i in (631, 632): put(i, "grant", "fellowship", D("theater"), H, "Directing fellowship.")
put(628, "grant", "fellowship", D("film", "theater"), H, "Directing fellowship.")
put(626, "residency", "residency", D("music"), M, "Teaching-artist residency; may be paid work.")
put(1077, "residency", "residency", D("visual", "film"), H, "Media residency.")
put(1078, "residency", "residency", D("visual", "writing", "film"), H, "Residency for several arts.")
put(1080, "residency", "residency", D("music", "film"), H, "Sound/media residency.")
put(1112, "residency", "residency", D("visual", "writing", "theater", "craft"), H, "Residency for several arts.")

# events that were mislabeled
put(603, "event", "open_mic", D(ALL), M, "Nature Open Mic: an open mic, not a workshop; performer type not stated.")
put(601, "event", "show", D("theater", "craft"), M, "Puppet show to attend.")
put(604, "event", "workshop", D("craft", "theater"), M, "Puppet making plus show.")
put(581, "event", "show", D("music"), M, "Family music show; was tagged dance.")
put(602, "event", "show", D("dance"), M, "Double Dutch event; not a music jam.")
put(625, "event", "show", D("music"), M, "Family jazz show; not a jam.")
put(587, "event", "show", D("writing"), M, "Storytelling night; format not stated.")
put(583, "event", "dance_night", D("dance"), M, "Kids dance party.")
put(1040, "event", "workshop", D("craft"), H, "Craft workshop, was labeled drawing session.")
put(1041, "event", "jam", D("music"), M, "Community sing-along.")
put(1047, "event", "meetup", D("visual"), M, "Art meetup, was labeled jam.")
put(1070, "event", "meetup", D("film"), M, "Film/video screening club.")
put(1092, "event", "open_studio", D("visual"), H, "Open studios.")
put(615, "event", "workshop", D("craft"), H, "Graphic design workshop (design counts as craft & design).")
put(610, "event", "workshop", D("theater", "film"), H, "On-camera acting workshop.")
put(614, "event", "workshop", D("theater", "film"), H, "On-camera acting workshop.")
put(476, "event", "workshop", D(ALL), M, "Family-history workshop at a museum; artist type unclear.")
put(584, "event", "workshop", D(ALL), M, "Creative practices workshop; several arts.")
put(1069, "event", "workshop", D(ALL), M, "Workshop at an art space; subject unclear.")
put(580, "event", "open_mic", D("dance"), M, "Open stage for movement artists.")
put(1255, "event", "open_mic", D(ALL), M, "Variety mic: several kinds of performers.")
put(505, "event", "open_mic", D("music", "comedy", "writing"), H, "Title says music, comedy and poetry.")

# ======================= default rules for the rest =======================
bulk_open = {"badslava", "openmikes", "mara-firemics-open-mics"}
CL = "mara-craigslist-new-york"

def cl_model(i, x):
    t = T(i).lower()
    if not re.search(r"\bmodel|modell?ing|photo ?shoot|photoshoot|photo-series|glamour|fall foliage shoot|regular looking", t): return None
    if re.search(r"photographer|videograph|makeup|hair|stylist", t) and not re.search(r"\bmodels?\b", t): return None
    d = ["model"]
    if re.search(r"actor|actress", t): d.append("theater")
    if re.search(r"dancer|dancing", t): d.append("dance")
    explicit = re.search(r"\bmodel|modell?ing", t)
    if re.search(r"aspiring model", t):
        return ("open_call", "collaboration", d, M, "A model looking for photographers to work with.")
    if re.search(r"figure|life model|sketching|drawing", t):
        return ("open_call", "model_call", d, H, "Model wanted for an art class or drawing session.")
    return ("open_call", "model_call", d, M if explicit else L, "Model wanted for a shoot." if explicit else "Photo shoot needing people; no 'model' word, guessed.")

def cl_rules(i, x):
    t = T(i).lower(); od = set(x["disciplines"])
    mus = "music" in od
    # services and ads that are not opportunities
    if re.search(r"lesson|instruction|rehearsal (space|studio)|music rehearsal|rehearsal studio|studio share|recording space|analog or digital recording|repair|transcription|musical charts|music kidz|offering affordable|private (drum|guitar|piano)|piano lessons|\bteacher\b|for hire|\bavail|instant results|look(ing)? to work for free|studio.*available|^producer|record company|jazz union|mixer", t) \
            and not re.search(r"seeking|wanted|needed", t):
        return ("open_call", "service_ad", D("music") if mus else D("visual"), M, "Someone offering lessons, space or their own services; not an opportunity to apply for.")
    if re.search(r"dance instructor", t):
        return ("job", "teaching_artist", D("dance"), M, "Dance instructor wanted.")
    if re.search(r"comedians wanted", t):
        return ("event", "open_mic", D("comedy"), M, "Promoter's open mic notice, was filed as a paid gig.")
    if mus and re.search(r"wanted|seeking|seeks|looking|iso\b|need|band|project|forming|jam|join|in search|searching|wtd|vocal|singer|drummer|guitar|bass|keys|horn|musician", t):
        return ("open_call", "collaboration", D("music"), M, "Musician looking for bandmates or a band; no pay stated.")
    if mus: return ("open_call", "service_ad", D("music"), L, "Music listing, unclear if work or ad.")
    return None

def cl_performance(i, x):
    t = T(i).lower()
    if re.search(r"dance instructor", t): return ("job", "teaching_artist", D("dance"), M, "Dance instructor wanted.")
    if re.search(r"comedians wanted", t): return ("event", "open_mic", D("comedy"), M, "Promoter's open mic notice, was filed as a paid gig.")
    if re.search(r"karaoke dj", t): return ("open_call", "paid_gig", D("music"), M, "DJ gig.")
    if re.search(r"musicians wanted|guitarist/singer|gospel singer|backing singers|singer songwriters|singers!|musical director|paid music jury|former rca", t):
        return ("open_call", "paid_gig", D("music"), M, "Paid music work, was tagged performance.")
    if re.search(r"entertainers wanted|female for modell|models and dancers", t):
        return ("open_call", "paid_gig", D("dance", "theater"), M, "Paid performer or dancer work.")
    if re.search(r"come be on tv", t): return ("open_call", "casting_call", D("music", "comedy", "dance", "theater"), M, "TV casting for mixed performers.")
    if re.search(r"content creator|street interview host|\bhost\b", t): return ("open_call", "paid_gig", D("theater", "film"), L, "On-camera host/creator work; guessed.")
    if re.search(r"crew wanted", t): return ("open_call", "paid_gig", D("film"), M, "Film crew wanted.")
    if re.search(r"model|photo ?shoot|photoshoot|shoot|influencer|glamour|editorial|lifestyle", t) and not re.search(r"casting|actor|film", t):
        return ("open_call", "paid_gig", D("theater"), L, "Modeling work; no app category fits, tagged theater as nearest.")
    if re.search(r"life models|figure model|figure drawing", t):
        return ("open_call", "paid_gig", D("visual"), M, "Model for an art class.")
    return ("open_call", "casting_call", D("theater"), M if re.search(r"casting|film|actor|extras|video|commercial|series|shoot|short|tv|voice", t) else L,
            "Casting notice for acting or on-camera work (not a paid gig in the music sense).")

def cl_visual(i, x):
    t = T(i).lower()
    if re.search(r"videograph|video|film|cinemat|web series|photo and video|podcast|youtube|camera", t):
        return ("open_call", "paid_gig", D("film", "visual") if "photo" in t else D("film"), M, "Paid video/film work.")
    if re.search(r"makeup|hair|face painting|sfx|tattoo|set dresser|stylist", t):
        return ("open_call", "paid_gig", D("craft"), L, "Beauty/props work; nearest category is craft.")
    if re.search(r"design|cad", t): return ("open_call", "paid_gig", D("craft", "visual"), M, "Design work.")
    if re.search(r"model|sketching", t): return ("open_call", "paid_gig", D("visual"), L, "Model for an artist; guessed.")
    if re.search(r"aspiring model", t): return ("open_call", "collaboration", D("visual"), L, "Model seeking photographers.")
    if re.search(r"calligraphy|sculpture|painting project|santa photos|intern", t): return ("open_call", "paid_gig", D("visual"), M, "Visual art work.")
    return ("open_call", "paid_gig", D("visual"), M, "Photography or visual job.")

for i, x in enumerate(recs):
    if i in res: continue
    s = x["source"]; t = T(i)
    if s in bulk_open:
        ot, st = x["opportunity_type"], x["subtype"]
        tl = t.lower()
        if st == "dance_night":
            put(i, "event", "dance_night", D("dance"), H, "Dance night listed at a venue.")
        else:
            pre = tl.split(" open mic")[0].split(" at ")[0]
            cats = []
            if "comedy" in pre: cats.append("comedy")
            if "music" in pre: cats.append("music")
            if "poetry" in pre or "poets" in pre: cats.append("writing")
            if s == "mara-firemics-open-mics": cats = ["comedy"]
            if s == "openmikes": cats = ["music"]
            if not cats: cats = ["music"]
            put(i, "event", "open_mic", D(*cats), H, "Open mic; type taken from the listing title.")
        continue
    if s == CL:
        r = cl_model(i, x)
        od = set(x["disciplines"])
        if r is not None:
            put(i, r[0], r[1], r[2], r[3], r[4]); continue
        if "performance" in od: r = cl_performance(i, x)
        elif "literary" in od: r = ("open_call", "paid_gig", D("writing"), H, "Paid writing work.")
        elif "visual" in od: r = cl_visual(i, x)
        if r is None: r = cl_rules(i, x)
        else:
            r2 = None
            if "music" in od: r2 = cl_rules(i, x)
        # music rows
        if "music" in od: r = cl_rules(i, x)
        if r is None: r = ("open_call", "paid_gig", list(x["disciplines"]), L, "Left as is; no rule matched.")
        put(i, *r[:2], r[2], r[3], r[4]); continue
    # default for other curated listings: keep type, tidy tags
    ot, st = x["opportunity_type"], x["subtype"]
    cats = []
    for tg in x["disciplines"]:
        c = TAG_CAT.get(tg)
        if c and c not in cats: cats.append(c)
    disc = D(ALL) if ALL in x["disciplines"] else D(*cats)
    why = "Kept; checked against title."
    conf = H
    if ot == "event" and ALL in x["disciplines"] and s not in ("nyfa-events",):
        g = infer(t)
        if g: disc, conf, why = D(*g[:3]), M, "Artist type guessed from the title (source said 'all')."
        else: conf, why = M, "Open to anyone; no artist type in the title."
    if ot == "grant": st = "fellowship" if st == "fellowship" else "grant"
    if ot == "residency": st = "residency"
    if ot == "job" and st not in ("internship",): st = "full_time"
    if ot == "open_call" and not st: st = "general_call"; conf = L; why = "No clear kind; left as general call."
    if ot == "open_call" and st == "fellowship": st = "fellowship"; ot = "grant"
    if not disc: disc, conf, why = D(ALL), L, "No artist type given."
    put(i, ot, st, disc, conf, why)

# photographers get their own artist type (replaces "visual" for photography listings)
PHOTO = re.compile(r"photograph|photo editor|photo/video|photo and video|santa photos|camera club|\bphoto\b.*shooter", re.I)
for i, r in res.items():
    if r["subtype"] == "model_call" or not PHOTO.search(T(i)): continue
    if "photograph" not in T(i).lower() and not PHOTO.search(T(i)): continue
    d = [t for t in r["disciplines"] if t not in ("visual", "all")]
    r["disciplines"] = ["photographer"] + d
    r["category_reason"] += " Photography listing, tagged photographer."

# videographers get their own artist type; production crew = people who support a shoot or show
VIDEO = re.compile(r"videograph|cinematograph|video editor|video needed|video assignment|video shooter|photo/video|youtube|creative video", re.I)
CREATIVE = re.compile(r"web series|short film|film noir|documentary|docu|music video|feature|comedy shoot|spec commercial", re.I)
CREW = re.compile(r"production assistant|\bpa\b|set dresser|gimbal|crew|backstage|makeup|sfx|hairstylist|stylist needed|activity host", re.I)
FILMY = re.compile(r"film|series|movie|cinematic|video|commercial|camera", re.I)
for i, r in res.items():
    if r["subtype"] not in ("paid_gig", "general_call", "collaboration") or r["opportunity_type"] != "open_call": continue
    t = T(i)
    rest = [d for d in r["disciplines"] if d not in ("film", "visual", "all", "craft")]
    if VIDEO.search(t) and not re.search(r"haircut", t, re.I):
        new = (["videographer"] + (["film"] if CREATIVE.search(t) else []) + rest)
        r["disciplines"] = list(dict.fromkeys(new)); r["category_reason"] += " Video shooting/editing job, tagged videographer."
    elif CREW.search(t) and not re.search(r"haircut|hair stylist instagram|photography/design student", t, re.I):
        new = (["crew"] + (["film"] if FILMY.search(t) else []) + rest)
        r["disciplines"] = list(dict.fromkeys(new)); r["category_reason"] += " Supports a shoot or show, tagged production crew."

# designers fold into visual artist; singers and poets get their own types
DESIGNY = re.compile(r"graphic design|designer|director of design|\bcad\b|bathroom design|apparel|ipa 2027|data vis|multimedia", re.I)
for i, r in res.items():
    d = r["disciplines"]
    if "craft" in d and DESIGNY.search(T(i)):
        r["disciplines"] = list(dict.fromkeys(["visual" if t == "craft" else t for t in d]))
        r["category_reason"] += " Design work, folded into visual artist."
    elif "craft" in d and "photograph" in T(i).lower():
        r["disciplines"] = [t for t in d if t != "craft"]

SING = re.compile(r"singer|singing|\bsing\b|sing-?along|vocal|choir|chorus|chorale|glee|a cappella|sacred harp|christian harmony|voice teacher|voice lessons|male voice", re.I)
INSTR = re.compile(r"musician|guitar|drum|bass|keyboard|\bkeys\b|piano|sax|horn|trumpet|violin|player|pianist|band members", re.I)
for i, r in res.items():
    d = r["disciplines"]
    if "music" not in d or re.search(r"\bdj\b", T(i), re.I): continue
    if r["subtype"] == "open_mic":
        r["disciplines"] = list(dict.fromkeys(d + ["singer"]))
    elif SING.search(T(i)):
        if INSTR.search(T(i)): r["disciplines"] = list(dict.fromkeys(d + ["singer"]))
        else: r["disciplines"] = list(dict.fromkeys(["singer" if t == "music" else t for t in d]))
        r["category_reason"] += " Singing listing, tagged singer."

POET = re.compile(r"poet|poetry|slam|spoken word|verse|laureate", re.I)
SPECIFIC_WRITING = re.compile(r"copywrit|article|journalis|author|true crime|essay|criticism|critical review|comedy writer|screenplay|script|content writ|storytell|memoir|comics|narrative|staff writer", re.I)
WRITERY = re.compile(r"writers?\b|prose|fiction|essay|novel|storytell", re.I)
for i, r in res.items():
    d = r["disciplines"]
    if "literary" not in d: continue
    text = T(i) + ("" if recs[i]["source"] in bulk_open else " " + (recs[i]["org"] or ""))
    if POET.search(text):
        new = ["poet"] + [t for t in d if t != "literary"]
        if WRITERY.search(text): new.append("literary")
        r["disciplines"] = list(dict.fromkeys(new))
        r["category_reason"] += " Poetry listing, tagged poet."
    elif not SPECIFIC_WRITING.search(text):
        # general writing with no genre named: poets can use it too
        r["disciplines"] = list(dict.fromkeys(d + ["poet"]))
        r["category_reason"] += " General writing (no genre), so poets see it too."

# a listing can have more than one kind; it still shows once in results. Extra kinds stay inside the same broad type.
for i, r in res.items():
    extra = []
    t = T(i)
    if r["opportunity_type"] == "open_call" and r["subtype"] in ("casting_call", "audition", "collaboration") and re.search(r"paid|\$\d", t, re.I):
        extra.append("paid_gig")
    if i == 562: extra += ["workshop", "dance_night"]
    if i == 1090: extra += ["dance_night"]
    if r["opportunity_type"] == "event" and r["subtype"] == "jam" and re.search(r"open mic", t, re.I): extra.append("open_mic")
    r["also_subtypes"] = [k for k in dict.fromkeys(extra) if k != r["subtype"]]

# ======================= write =======================
def kind_key(typ, sub): return f"{typ}/{sub}"
def sub_norm_old(typ, sub):
    if sub: return sub
    return {"grant": "grant", "residency": "residency", "open_call": "general_call", "job": "full_time"}.get(typ, "none")

out = []
chg = C.Counter()
changed_rows = []
for i, x in enumerate(recs):
    n = dict(x)
    r = res[i]
    n.update(r)
    out.append(n)
    oc, nc = old_cats(x["disciplines"]), old_cats(r["disciplines"])
    c_cat = oc != nc
    c_type = x["opportunity_type"] != r["opportunity_type"]
    c_sub = sub_norm_old(x["opportunity_type"], x["subtype"]) != r["subtype"]
    if c_cat: chg["artist type"] += 1
    if c_type: chg["broad type"] += 1
    if c_sub: chg["kind"] += 1
    if c_cat or c_type or c_sub: chg["any"] += 1
    n["_chg"] = (c_cat, c_type, c_sub)
for n in out: n.pop("_chg", None)
json.dump(dict(snapshot_id=data["snapshot_id"], count=len(out), records=out), open(OUT + "/records.recategorized.json", "w", encoding="utf8"), ensure_ascii=False, indent=1)
print(dict(chg))
print(C.Counter(r["category_confidence"] for r in res.values()))
print(sorted(C.Counter(kind_key(r["opportunity_type"], r["subtype"]) for r in res.values()).items(), key=lambda kv: -kv[1]))
