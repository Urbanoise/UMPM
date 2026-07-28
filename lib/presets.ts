// Pre-filled task name suggestions, mirrored from the STSPortal proposal
// section "სამუშაო პროცესი და ჩასაბარებელი დოკუმენტები" (Work Process &
// Deliverables). Kept in sync manually with STSPortal/src/ProposalPortal.jsx.
export interface TaskPreset {
  en: string;
  ge: string;
}

export const TASK_NAME_PRESETS: TaskPreset[] = [
  { en: "Traffic Impact Assessment", ge: "ტრანსპორტზე ზეგავლენის შეფასება" },
  { en: "Macro Transport Model", ge: "მაკრო სატრანსპორტო მოდელი" },
  { en: "Micro-modelling", ge: "მიკრო-მოდელირება" },
  { en: "Pedestrian Simulation", ge: "საქვეითო ნაკადების მოდელირება" },
  {
    en: "Traffic Organization Schemes",
    ge: "საგზაო მოძრაობის ორგანიზების სქემები",
  },
  {
    en: "Parking Organization Schemes",
    ge: "პარკირების ორგანიზების სქემები",
  },
  { en: "Complete Street Design", ge: "სრული ქუჩის დიზაინი" },
  {
    en: "Key Insights & Recommendations",
    ge: "ძირითადი დასკვნები და რეკომენდაციები",
  },
];
