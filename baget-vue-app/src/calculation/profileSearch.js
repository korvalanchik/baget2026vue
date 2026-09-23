const normalize = (value) =>
  String(value ?? "")
    .trim()
    .toLocaleLowerCase("uk-UA");

export function filterProfiles(profiles, query) {
  const term = normalize(query);
  return term
    ? profiles.filter((profile) =>
        Number(profile.partNo) !== 33190 && normalize(profile.description).includes(term),
      )
    : [];
}
