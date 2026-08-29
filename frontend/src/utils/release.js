const fallbackVersion = typeof import.meta !== "undefined" && import.meta.env?.VITE_APP_VERSION
  ? import.meta.env.VITE_APP_VERSION
  : "dev"

export const normalizeRelease = payload => {
  const tag = typeof payload?.tag === "string" && /^v\d+\.\d+\.\d+$/.test(payload.tag)
    ? payload.tag
    : fallbackVersion
  return {
    tag,
    commit: typeof payload?.commit === "string" ? payload.commit : "",
    deployedAt: typeof payload?.deployed_at === "string" ? payload.deployed_at : "",
  }
}

export const fetchRelease = async (fetchImpl = fetch) => {
  try {
    const response = await fetchImpl("/release.json", {cache: "no-store"})
    if (!response.ok) throw new Error(`release metadata request failed: ${response.status}`)
    return normalizeRelease(await response.json())
  } catch {
    return normalizeRelease({tag: fallbackVersion})
  }
}
