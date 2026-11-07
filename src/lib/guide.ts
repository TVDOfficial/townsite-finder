import type { TenureKey, TownSize } from "./analysis";
import type { StateCode } from "./types";

interface StateInfo {
  viewer: { label: string; url: string };
  planning: string;
  water: string;
  leases: string;
  links: { label: string; url: string }[];
}

export const STATE_INFO: Record<StateCode, StateInfo> = {
  NSW: {
    viewer: { label: "SIX Maps (NSW)", url: "https://maps.six.nsw.gov.au" },
    planning: "A planning proposal to amend the council's Local Environmental Plan (LEP), assessed by the council and the NSW Department of Planning.",
    water: "A water access licence and works approval through WaterNSW. Most NSW rivers are fully allocated, so you usually buy existing licences on the water market.",
    leases: "Western Division land is held under Western Lands leases, managed by NSW Crown Lands.",
    links: [{ label: "NSW Planning Portal", url: "https://www.planningportal.nsw.gov.au" }, { label: "WaterNSW", url: "https://www.waternsw.com.au" }],
  },
  VIC: {
    viewer: { label: "VicPlan", url: "https://mapshare.vic.gov.au/vicplan/" },
    planning: "A planning scheme amendment to rezone the land, then a subdivision permit from the council.",
    water: "A take-and-use licence from the local rural water corporation, or water shares bought on the Victorian Water Register.",
    leases: "Crown land in Victoria is managed by the state environment department and is rarely sold.",
    links: [{ label: "Planning Victoria", url: "https://www.planning.vic.gov.au" }, { label: "Victorian Water Register", url: "https://waterregister.vic.gov.au" }],
  },
  QLD: {
    viewer: { label: "Queensland Globe", url: "https://qldglobe.information.qld.gov.au" },
    planning: "An amendment to the council's planning scheme (or a state-led Priority Development Area for big projects), then a development approval to reconfigure lots.",
    water: "A water licence or allocation under Queensland's Water Act; in the Great Artesian Basin, bore water is tightly regulated.",
    leases: "State leasehold (rolling-term and term leases) can sometimes be converted to freehold by application to the state lands department.",
    links: [],
  },
  SA: {
    viewer: { label: "Location SA Map Viewer", url: "https://location.sa.gov.au/viewer/" },
    planning: "A Code Amendment to the state Planning and Design Code, then land division approval through PlanSA.",
    water: "A water licence from the regional Landscape Board / Department for Environment and Water in prescribed areas.",
    leases: "Pastoral leases are overseen by the Pastoral Board; non-pastoral uses need its approval or a change of tenure.",
    links: [{ label: "PlanSA", url: "https://plan.sa.gov.au" }],
  },
  WA: {
    viewer: { label: "Landgate", url: "https://www.landgate.wa.gov.au" },
    planning: "A local planning scheme amendment and structure plan, then subdivision approval from the WA Planning Commission.",
    water: "A licence to take water from the Department of Water and Environmental Regulation (DWER).",
    leases: "Pastoral leases are overseen by the Pastoral Lands Board; unallocated Crown land is managed by the Department of Planning, Lands and Heritage.",
    links: [],
  },
  NT: {
    viewer: { label: "NR Maps (NT)", url: "https://nrmaps.nt.gov.au" },
    planning: "A rezoning (amendment to the NT Planning Scheme) via the Development Consent Authority, then subdivision consent.",
    water: "A water extraction licence under the NT Water Act.",
    leases: "Nearly half the NT is Aboriginal freehold under the Land Rights Act, which can't be bought. Pastoral leases are managed by the Pastoral Land Board.",
    links: [],
  },
  TAS: {
    viewer: { label: "LISTmap (TAS)", url: "https://maps.thelist.tas.gov.au" },
    planning: "A rezoning under the Tasmanian Planning Scheme (Local Provisions Schedule), then a subdivision permit.",
    water: "A water licence under the Tasmanian Water Management Act, plus a TasWater connection plan for a town.",
    leases: "Crown land is managed by Crown Land Services and can sometimes be bought by application.",
    links: [],
  },
  ACT: {
    viewer: { label: "ACTmapi", url: "https://www.actmapi.act.gov.au" },
    planning: "Changes to the Territory Plan, controlled by the ACT Government. New towns in the ACT are government-led only.",
    water: "Managed by the ACT Government and Icon Water.",
    leases: "All ACT land is government-owned and leased; you can't get freehold.",
    links: [],
  },
};

export interface GuideStep {
  title: string;
  body: string;
  time: string;
}

export function acquisitionSteps(tenure: TenureKey, state: StateCode): GuideStep[] {
  const s = STATE_INFO[state];
  switch (tenure) {
    case "freehold":
      return [
        { title: "Find the owner", body: `Check the parcel on ${s.viewer.label}, then order a title search to see who owns it. Most farms aren't listed for sale, so you'd approach the owner directly or through a rural agent.`, time: "1–3 months" },
        { title: "Negotiate and do due diligence", body: "Get a valuation, check zoning, easements, flood and bushfire overlays, contamination and any water licences attached to the land.", time: "1–3 months" },
        { title: "Buy and settle", body: "Exchange contracts, pay stamp duty (around 4–6%) and settle like any property purchase.", time: "1–2 months" },
      ];
    case "pastoral":
      return [
        { title: "Buy the lease (the station)", body: "Pastoral leases are bought and sold like properties, usually through specialist rural agents. The state minister or pastoral board must approve the transfer.", time: "3–9 months" },
        { title: "Apply to change the land use", body: s.leases + " A town isn't a pastoral use, so you'd need the state to excise part of the lease and convert it to freehold or a special lease.", time: "1–3 years" },
        { title: "Deal with native title", body: "Changing pastoral land to freehold is a 'future act' under the Native Title Act. That usually means negotiating an Indigenous Land Use Agreement (ILUA) with the native title holders.", time: "1–3 years" },
      ];
    case "crown":
      return [
        { title: "Confirm it's unallocated Crown land", body: `Check ${s.viewer.label} and contact the state lands department. ${s.leases}`, time: "1–2 months" },
        { title: "Apply to buy or lease it", body: "States can sell Crown land by application if it isn't needed for public purposes. They'll do a land assessment and set the price by valuation.", time: "1–3 years" },
        { title: "Resolve native title", body: "Granting freehold over Crown land usually needs an ILUA or a compulsory process with compensation. This is often the longest step.", time: "2–5 years" },
      ];
    case "act-lease":
      return [{ title: "Talk to the ACT Government", body: s.leases + " A new town would have to be a government project.", time: "—" }];
    default:
      return [
        { title: "This land isn't for sale", body: "National parks, reserves, Indigenous Protected Areas and Aboriginal freehold can't normally be bought. Try another spot, or look at partnering with Traditional Owners if you want to work on their land.", time: "—" },
      ];
  }
}

export function buildSteps(state: StateCode, size: TownSize, lga?: string): GuideStep[] {
  const s = STATE_INFO[state];
  const council = lga ? `${lga}` : "the local council";
  return [
    { title: "Early talks", body: `Meet ${council} and the state planning department. New towns need a strong case: jobs, housing demand, or a reason people would live there.`, time: "3–6 months" },
    { title: "Studies", body: "Flora and fauna (including federal EPBC threatened species), Aboriginal cultural heritage, bushfire, flood, traffic, soil and groundwater studies.", time: "6–18 months" },
    { title: "Rezoning", body: s.planning, time: size.key === "eco" ? "6–18 months" : "1–3 years" },
    { title: "Water", body: `${s.water} A ${size.label.toLowerCase()} needs roughly ${size.waterMLPerYear.toLocaleString()} ML a year.`, time: "6 months–2 years" },
    { title: "Infrastructure", body: size.key === "eco" ? "Solar + batteries, rainwater tanks, on-site wastewater treatment, a sealed access road and a telecom tower or satellite internet." : "Grid connection or a solar farm, water treatment, sewage treatment, sealed roads, NBN and mobile coverage. Utilities often want developer contributions up front.", time: "1–3 years" },
    { title: "Subdivision & titles", body: "Subdivision approval, engineering plans, construction of stage 1, then new titles issued so lots can be sold.", time: "1–2 years" },
    { title: "Services", body: size.key === "large" ? "Schools, hospital, police and fire are state-run. You'd need agreement from those departments, usually tied to population milestones." : "A school, clinic and emergency services usually only arrive once enough people live there. Plan for private or community-run services early.", time: "Ongoing" },
  ];
}

export const GENERAL_LINKS = [
  { label: "National Native Title Tribunal", url: "https://www.nntt.gov.au" },
  { label: "EPBC Act (federal environment approvals)", url: "https://www.dcceew.gov.au/environment/epbc" },
];
