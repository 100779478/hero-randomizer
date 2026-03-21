function shuffle(items) {
  const result = [...items];

  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }

  return result;
}

function normalizePreferredRoles(value) {
  if (Array.isArray(value)) {
    const roles = value.filter((role) => role === "T" || role === "C" || role === "N");
    return roles.length ? Array.from(new Set(roles)) : ["T", "C", "N"];
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed || trimmed === "any") {
      return ["T", "C", "N"];
    }

    if (trimmed.startsWith("[")) {
      try {
        return normalizePreferredRoles(JSON.parse(trimmed));
      } catch {
        return ["T", "C", "N"];
      }
    }

    if (trimmed === "T" || trimmed === "C" || trimmed === "N") {
      return [trimmed];
    }
  }

  return ["T", "C", "N"];
}

function buildRivalSet(rivals) {
  const map = new Map();

  rivals.forEach((rival) => {
    const left = Number(rival.player1Id);
    const right = Number(rival.player2Id);

    if (!map.has(left)) {
      map.set(left, new Set());
    }
    if (!map.has(right)) {
      map.set(right, new Set());
    }

    map.get(left).add(right);
    map.get(right).add(left);
  });

  return map;
}

function teamLevel(team) {
  return team.reduce((sum, player) => sum + Number(player.level || 0), 0);
}

function hasRival(player, team, rivalSet) {
  const rivals = rivalSet.get(Number(player.id));
  if (!rivals) {
    return false;
  }

  return team.some((member) => rivals.has(Number(member.id)));
}

function autoBalanceTeams(players, rivals = []) {
  const rivalSet = buildRivalSet(rivals);
  const sortedPlayers = shuffle(players).sort((left, right) => Number(right.level) - Number(left.level));
  const teamA = [];
  const teamB = [];

  sortedPlayers.forEach((player) => {
    const rivalInA = hasRival(player, teamA, rivalSet);
    const rivalInB = hasRival(player, teamB, rivalSet);

    if (rivalInA && !rivalInB) {
      teamB.push(player);
      return;
    }

    if (rivalInB && !rivalInA) {
      teamA.push(player);
      return;
    }

    if (teamA.length < teamB.length) {
      teamA.push(player);
      return;
    }

    if (teamB.length < teamA.length) {
      teamB.push(player);
      return;
    }

    if (teamLevel(teamA) <= teamLevel(teamB)) {
      teamA.push(player);
      return;
    }

    teamB.push(player);
  });

  return { teamA, teamB };
}

function fixedTeams(players, manualTeams) {
  const teamA = [];
  const teamB = [];

  players.forEach((player) => {
    if (manualTeams[String(player.id)] === "A") {
      teamA.push(player);
    } else if (manualTeams[String(player.id)] === "B") {
      teamB.push(player);
    }
  });

  return { teamA, teamB };
}

function roleRequirements(teamSize) {
  if (teamSize === 5) {
    return { T: 1, C: 2, N: 2 };
  }

  if (teamSize === 6) {
    return { T: 2, C: 2, N: 2 };
  }

  return null;
}

function availableHeroesByRole(heroes, usedSet) {
  return {
    T: heroes.filter((hero) => hero.roleCode === "T" && !usedSet.has(hero.key)),
    C: heroes.filter((hero) => hero.roleCode === "C" && !usedSet.has(hero.key)),
    N: heroes.filter((hero) => hero.roleCode === "N" && !usedSet.has(hero.key)),
    ALL: heroes.filter((hero) => !usedSet.has(hero.key)),
  };
}

function assignFromPool(player, list, usedSet) {
  if (!list.length) {
    return null;
  }

  const [hero] = shuffle(list);
  usedSet.add(hero.key);
  player.hero = hero;
  return hero;
}

function assignTeamHeroes(team, heroes, options) {
  const requirements = roleRequirements(team.length);
  const usedSet = options.usedSet;
  const bindMap = options.bindMap || new Map();

  team.forEach((player) => {
    player.hero = null;
    player.preferredRoles = normalizePreferredRoles(player.preferredRoles || player.preferredRole);
  });

  if (!requirements) {
    team.forEach((player) => {
      const pool = availableHeroesByRole(heroes, usedSet).ALL;
      assignFromPool(player, pool, usedSet);
    });
    return;
  }

  team.forEach((player) => {
    const boundHero = bindMap.get(Number(player.id));
    if (boundHero && !usedSet.has(boundHero.key)) {
      player.hero = boundHero;
      usedSet.add(boundHero.key);
    }
  });

  const assignedByRole = () => ({
    T: team.filter((player) => player.hero?.roleCode === "T").length,
    C: team.filter((player) => player.hero?.roleCode === "C").length,
    N: team.filter((player) => player.hero?.roleCode === "N").length,
  });

  const assignRoleToCandidates = (role, candidates) => {
    let current = assignedByRole()[role];
    const needed = requirements[role];
    const queue = shuffle(candidates.filter((player) => !player.hero));

    while (current < needed && queue.length) {
      const player = queue.shift();
      const pool = availableHeroesByRole(heroes, usedSet)[role];
      const assigned = assignFromPool(player, pool, usedSet);
      if (!assigned) {
        break;
      }
      current += 1;
    }
  };

  ["T", "N", "C"].forEach((role) => {
    assignRoleToCandidates(role, team.filter((player) => player.preferredRoles.length === 1 && player.preferredRoles[0] === role));
  });

  ["T", "N", "C"].forEach((role) => {
    assignRoleToCandidates(role, team.filter((player) => player.preferredRoles.length > 1 && player.preferredRoles.includes(role)));
  });

  const remainingPlayers = shuffle(team.filter((player) => !player.hero));

  remainingPlayers.forEach((player) => {
    const current = assignedByRole();
    const desiredOrder = ["T", "N", "C"]
      .filter((role) => current[role] < requirements[role] && player.preferredRoles.includes(role))
      .concat(["T", "N", "C"].filter((role) => current[role] < requirements[role] && !player.preferredRoles.includes(role)))
      .concat(["T", "N", "C"]);

    for (const role of desiredOrder) {
      const pool = availableHeroesByRole(heroes, usedSet)[role];
      const assigned = assignFromPool(player, pool, usedSet);
      if (assigned) {
        return;
      }
    }

    assignFromPool(player, availableHeroesByRole(heroes, usedSet).ALL, usedSet);
  });
}

function serializePlayer(player) {
  return {
    id: player.id,
    name: player.name,
    level: player.level,
    preferredRoles: normalizePreferredRoles(player.preferredRoles || player.preferredRole),
    hero: player.hero
      ? {
          id: player.hero.id,
          roleCode: player.hero.roleCode,
          name: player.hero.name,
          displayName: `${player.hero.roleCode}-${player.hero.name}`,
        }
      : null,
  };
}

function drawMatch(input) {
  const {
    mode,
    players,
    heroes,
    maps,
    rivals,
    binds,
    allowRepeatHeroes,
    autoAssignHeroes,
    manualTeams = {},
  } = input;

  if (!players.length || players.length % 2 !== 0) {
    throw new Error("参赛人数必须为偶数。");
  }

  const teamSize = players.length / 2;
  const useRivals = mode === "random-v2";
  let teams;

  if (mode === "fixed-team") {
    teams = fixedTeams(players, manualTeams);
    if (teams.teamA.length !== teams.teamB.length || teams.teamA.length === 0) {
      throw new Error("固定分队模式下，A/B 两队人数必须一致。");
    }
  } else {
    teams = autoBalanceTeams(players, useRivals ? rivals : []);
  }

  const heroRows = heroes.map((hero) => ({
    ...hero,
    key: allowRepeatHeroes ? `${hero.id}-${Math.random().toString(36).slice(2)}` : `${hero.id}-strict`,
  }));
  const bindMap = new Map();

  if (mode === "random-v2") {
    binds.forEach((bind) => {
      const matchedHero = heroRows.find((hero) => hero.id === bind.heroId);
      if (matchedHero) {
        bindMap.set(bind.playerId, matchedHero);
      }
    });
  }

  if (autoAssignHeroes) {
    const sharedUsedSet = new Set();
    const teamAUsed = allowRepeatHeroes ? new Set() : sharedUsedSet;
    const teamBUsed = allowRepeatHeroes ? new Set() : sharedUsedSet;

    assignTeamHeroes(teams.teamA, heroRows, { usedSet: teamAUsed, bindMap });
    assignTeamHeroes(teams.teamB, heroRows, { usedSet: teamBUsed, bindMap });
  }

  const selectedMap = maps.length ? shuffle(maps)[0] : null;

  return {
    mode,
    selectedMap,
    teams: {
      teamA: teams.teamA.map(serializePlayer),
      teamB: teams.teamB.map(serializePlayer),
    },
    summary: {
      totalPlayers: players.length,
      teamSize,
      autoAssignHeroes,
      allowRepeatHeroes,
      levelGap: Math.abs(teamLevel(teams.teamA) - teamLevel(teams.teamB)),
    },
  };
}

module.exports = {
  drawMatch,
};
