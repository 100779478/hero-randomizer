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

function roleLabel(role) {
  return { T: "坦克", C: "输出", N: "辅助" }[role] || role;
}

function formatRoleRequirements(requirements) {
  return `${requirements.T}${roleLabel("T")}/${requirements.C}${roleLabel("C")}/${requirements.N}${roleLabel("N")}`;
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

function buildRoleAssignmentPlan(team, requirements, bindMap) {
  const remaining = { ...requirements };
  const plan = new Map();
  const unboundPlayers = [];

  for (const player of team) {
    const boundHero = bindMap.get(Number(player.id));
    if (!boundHero) {
      unboundPlayers.push(player);
      continue;
    }

    if (!player.preferredRoles.includes(boundHero.roleCode)) {
      return {
        error: `玩家「${player.name}」的专属英雄职责与位置偏好冲突，请调整偏好或专属英雄后重试`,
      };
    }

    remaining[boundHero.roleCode] -= 1;
    if (remaining[boundHero.roleCode] < 0) {
      return {
        error: `当前队伍的玩家位置偏好和专属英雄无法满足 ${formatRoleRequirements(requirements)} 阵容要求`,
      };
    }

    plan.set(Number(player.id), boundHero.roleCode);
  }

  function backtrack(players) {
    if (!players.length) {
      return Object.values(remaining).every((count) => count === 0);
    }

    const orderedPlayers = shuffle(players).sort((left, right) => {
      const leftOptions = left.preferredRoles.filter((role) => remaining[role] > 0).length;
      const rightOptions = right.preferredRoles.filter((role) => remaining[role] > 0).length;
      return leftOptions - rightOptions;
    });
    const [player, ...rest] = orderedPlayers;
    const roleOptions = shuffle(player.preferredRoles.filter((role) => remaining[role] > 0));

    if (!roleOptions.length) {
      return false;
    }

    for (const role of roleOptions) {
      remaining[role] -= 1;
      plan.set(Number(player.id), role);
      if (backtrack(rest)) {
        return true;
      }
      plan.delete(Number(player.id));
      remaining[role] += 1;
    }

    return false;
  }

  if (!backtrack(unboundPlayers)) {
    return {
      error: `当前队伍的玩家位置偏好无法满足 ${formatRoleRequirements(requirements)} 阵容要求`,
    };
  }

  return { plan };
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
    return { ok: true };
  }

  const rolePlanResult = buildRoleAssignmentPlan(team, requirements, bindMap);
  if (!rolePlanResult.plan) {
    return { ok: false, error: rolePlanResult.error };
  }

  team.forEach((player) => {
    const boundHero = bindMap.get(Number(player.id));
    if (!boundHero) {
      return;
    }

    if (usedSet.has(boundHero.key)) {
      throw new Error(`玩家「${player.name}」的专属英雄与当前分配冲突，请允许重复英雄或调整专属英雄后重试`);
    }

    if (rolePlanResult.plan.get(Number(player.id)) === boundHero.roleCode) {
      player.hero = boundHero;
      usedSet.add(boundHero.key);
    }
  });

  const remainingPlayers = shuffle(team.filter((player) => !player.hero));
  for (const player of remainingPlayers) {
    const plannedRole = rolePlanResult.plan.get(Number(player.id));
    if (!plannedRole) {
      return { ok: false, error: `玩家「${player.name}」缺少可用的位置分配方案` };
    }

    const pool = availableHeroesByRole(heroes, usedSet)[plannedRole];
    const assigned = assignFromPool(player, pool, usedSet);
    if (!assigned) {
      return {
        ok: false,
        error: `${roleLabel(plannedRole)}英雄不足，无法按玩家位置偏好完成分配`,
      };
    }
  }

  return { ok: true };
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

function validateHeroAllocation(teamA, teamB, teamSize) {
  const req = roleRequirements(teamSize);
  if (!req) return true;
  const count = (team) => ({
    T: team.filter((p) => p.hero?.roleCode === "T").length,
    C: team.filter((p) => p.hero?.roleCode === "C").length,
    N: team.filter((p) => p.hero?.roleCode === "N").length,
  });
  const a = count(teamA);
  const b = count(teamB);
  return a.T === req.T && a.C === req.C && a.N === req.N
    && b.T === req.T && b.C === req.C && b.N === req.N
    && teamA.every((p) => p.hero) && teamB.every((p) => p.hero);
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

  if (!allowRepeatHeroes) {
    const req = roleRequirements(teamSize);
    if (req) {
      const heroCounts = { T: 0, C: 0, N: 0 };
      heroes.forEach((h) => { if (heroCounts[h.roleCode] !== undefined) heroCounts[h.roleCode] += 1; });
      if (heroCounts.T < req.T * 2) throw new Error(`坦克英雄总数不足，需要 ${req.T * 2}，当前 ${heroCounts.T}`);
      if (heroCounts.C < req.C * 2) throw new Error(`输出英雄总数不足，需要 ${req.C * 2}，当前 ${heroCounts.C}`);
      if (heroCounts.N < req.N * 2) throw new Error(`辅助英雄总数不足，需要 ${req.N * 2}，当前 ${heroCounts.N}`);
    }
  }

  let teams;
  if (mode === "fixed-team") {
    teams = fixedTeams(players, manualTeams);
    if (teams.teamA.length !== teams.teamB.length || teams.teamA.length === 0) {
      throw new Error("固定分队模式下，A/B 两队人数必须一致。");
    }
  } else {
    teams = autoBalanceTeams(players, useRivals ? rivals : []);
  }

  if (autoAssignHeroes) {
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

    let valid = false;
    let lastError = "";
    for (let retry = 0; retry < 50; retry += 1) {
      if (mode !== "fixed-team") {
        teams = autoBalanceTeams(players, useRivals ? rivals : []);
      }

      const sharedUsedSet = new Set();
      const teamAUsed = allowRepeatHeroes ? new Set() : sharedUsedSet;
      const teamBUsed = allowRepeatHeroes ? new Set() : sharedUsedSet;

      // Reset hero assignments
      teams.teamA.forEach((p) => { p.hero = null; });
      teams.teamB.forEach((p) => { p.hero = null; });

      const teamAResult = assignTeamHeroes(teams.teamA, heroRows, { usedSet: teamAUsed, bindMap });
      if (!teamAResult.ok) {
        lastError = teamAResult.error || lastError;
        continue;
      }

      const teamBResult = assignTeamHeroes(teams.teamB, heroRows, { usedSet: teamBUsed, bindMap });
      if (!teamBResult.ok) {
        lastError = teamBResult.error || lastError;
        continue;
      }

      if (validateHeroAllocation(teams.teamA, teams.teamB, teamSize)) {
        valid = true;
        break;
      }

      lastError = "英雄分配未能满足角色配置要求，请检查玩家位置偏好和英雄池后重试";
    }

    if (!valid) {
      throw new Error(lastError || "英雄分配未能满足角色配置要求，请扩大英雄池或允许两队重复英雄后重试");
    }
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
