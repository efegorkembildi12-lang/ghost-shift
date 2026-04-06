export function parseCliArgs(argv) {
  const [command, ...rest] = argv;
  const positionals = [];
  const options = {};

  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index];

    if (!token.startsWith("--")) {
      positionals.push(token);
      continue;
    }

    const withoutPrefix = token.slice(2);
    const [key, inlineValue] = withoutPrefix.split("=");

    if (inlineValue !== undefined) {
      appendOption(options, key, inlineValue);
      continue;
    }

    const next = rest[index + 1];
    if (next && !next.startsWith("--")) {
      appendOption(options, key, next);
      index += 1;
      continue;
    }

    appendOption(options, key, true);
  }

  return { command, positionals, options };
}

export function parseFilesOption(value) {
  if (!value) {
    return [];
  }

  if (Array.isArray(value)) {
    return value.flatMap((entry) => parseFilesOption(entry));
  }

  return String(value)
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export function parseDecisionOption(value) {
  return parseTextArrayOption(value)
    .map((entry) => {
      const [candidateType, ...rest] = entry.split(":");
      const knownTypes = new Set(["rationale", "risk", "tradeoff", "follow-up"]);

      if (rest.length > 0 && knownTypes.has(candidateType.trim())) {
        return {
          type: candidateType.trim(),
          summary: rest.join(":").trim()
        };
      }

      return {
        type: "rationale",
        summary: entry.trim()
      };
    })
    .filter((entry) => entry.summary);
}

export function parseVerificationOption(value) {
  return parseTextArrayOption(value)
    .map((entry) => {
      const [name, status = "pending", ...details] = entry.split(":");
      const normalizedName = name.trim();
      const normalizedStatus = status.trim() || "pending";
      const normalizedDetails = details.join(":").trim();

      if (!normalizedName) {
        return null;
      }

      return {
        name: normalizedName,
        status: normalizedStatus,
        details: normalizedDetails || null
      };
    })
    .filter(Boolean);
}

function appendOption(options, key, value) {
  if (!(key in options)) {
    options[key] = value;
    return;
  }

  if (Array.isArray(options[key])) {
    options[key].push(value);
    return;
  }

  options[key] = [options[key], value];
}

function parseTextArrayOption(value) {
  if (!value) {
    return [];
  }

  if (Array.isArray(value)) {
    return value.flatMap((entry) => parseTextArrayOption(entry));
  }

  return [String(value)];
}
