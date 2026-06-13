import { seedOutreachProspects, sendProspectOutreachBatch } from "../app/prospect-outreach.server";

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const seedOnly = process.argv.includes("--seed-only");

  console.log("Seeding ICP prospects...");
  const seed = await seedOutreachProspects();
  console.log(JSON.stringify({ seed }, null, 2));

  if (seedOnly) return;

  console.log(dryRun ? "Preview outreach batch..." : "Sending outreach batch...");
  const result = await sendProspectOutreachBatch({ dryRun, limit: 12 });
  console.log(JSON.stringify(result, null, 2));
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
