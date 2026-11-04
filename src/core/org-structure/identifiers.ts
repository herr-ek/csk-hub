/** Stable Group type identifiers shared by the database and organisation policies. */
export enum GroupType {
  Choir = "Choir",
  Section = "Section",
  Board = "Board",
  GigGroup = "GigGroup",
  GigCommittee = "Gigmästeri",
  SocialCommittee = "Sexmästeri",
  EquipmentTeam = "Roddgrupp",
  PartyTeam = "Festgrupp",
  RehearsalWeekendTeam = "Rephelg",
  ConcertCommittee = "Konsertmästeri",
  RecruitmentCommittee = "Rekryteringskommitté",
  TourCommittee = "Turnékommitté",
  NominationCommittee = "Valberedning",
  WebTeam = "Webmästeri",
  ParentsMeeting = "Föräldramötet",
  Archives = "Arkivarie",
  MemorisationCommittee = "Utantillkommitté",
  Other = "Övrig"
}

/** Stable Position codes; translated labels belong to the Position definitions. */
export enum PositionCode {
  Chair = "ordforande",
  ViceChair = "vice-ordforande",
  Treasurer = "kassor",
  Secretary = "sekreterare",
  PublicRelationsOfficer = "pr-mastare",
  FirstConcertMaster = "forsta-konsertmastare",
  OrganisationGigCoordinator = "csk-gigmastare",
  SocialCoordinator = "sexmastare",
  DeputySocialCoordinator = "sexmastarinna",
  FinancialOfficer = "ekonomiskt-ansvarig",
  Conductor = "dirigent",
  MusicLibrarian = "notfiskal",
  ChoirConcertMaster = "choir-konsertmastare",
  ChoirGigCoordinator = "choir-gigmastare",
  SectionParent = "stamforalder",
  GigLeader = "gigledare"
}
