(function attachRandomModeHelpers(global) {
  function normalizeRolesFallback(value) {
    if (Array.isArray(value)) {
      const roles = value.filter((role) => role === "T" || role === "C" || role === "N");
      return roles.length ? Array.from(new Set(roles)) : ["T", "C", "N"];
    }

    const text = String(value || "").trim();
    if (!text || text === "any") {
      return ["T", "C", "N"];
    }

    if (text.startsWith("[")) {
      try {
        return normalizeRolesFallback(JSON.parse(text));
      } catch {
        return ["T", "C", "N"];
      }
    }

    if (text === "T" || text === "C" || text === "N") {
      return [text];
    }

    return ["T", "C", "N"];
  }

  function clonePlayer(player, normalizePreferredRoles) {
    const normalized = normalizePreferredRoles(player.preferredRoles || player.preferredRole);
    return {
      ...player,
      preferredRole: normalized,
      preferredRoles: normalized,
      hero: null,
    };
  }

  function hasRivalInTeamByName(player, team, rivals) {
    return rivals.some((rival) => {
      if (rival.player1Name === player.name) return team.some((member) => member.name === rival.player2Name);
      if (rival.player2Name === player.name) return team.some((member) => member.name === rival.player1Name);
      return false;
    });
  }

  function parseLegacyHeroString(heroStr) {
    const text = String(heroStr || "").trim();
    if (!text) return null;
    const dashIndex = text.indexOf("-");
    if (dashIndex > 0) {
      const role = text.slice(0, dashIndex).trim().toUpperCase();
      const name = text.slice(dashIndex + 1).trim();
      return { role: ["T", "C", "N"].includes(role) ? role : "C", name: name || text, raw: text };
    }
    return { role: "C", name: text, raw: text };
  }

  function groupLegacyHeroesByRole(heroes) {
    return {
      T: heroes.filter((hero) => hero.role === "T"),
      C: heroes.filter((hero) => hero.role === "C"),
      N: heroes.filter((hero) => hero.role === "N"),
      ALL: heroes.slice(),
    };
  }

  function getTeamRoleRequirements(teamSize) {
    return teamSize === 6 ? { T: 2, C: 2, N: 2 } : { T: 1, C: 2, N: 2 };
  }

  function roleLabel(role) {
    return { T: "坦克", C: "输出", N: "辅助" }[role] || role;
  }

  function formatRoleRequirements(requirements) {
    return `${requirements.T}${roleLabel("T")}/${requirements.C}${roleLabel("C")}/${requirements.N}${roleLabel("N")}`;
  }

  function isValidAllocationLegacy(teamA, teamB, teamSize) {
    const need = getTeamRoleRequirements(teamSize);
    const count = (team) => ({
      T: team.filter((player) => parseLegacyHeroString(player.hero?.displayName || player.hero)?.role === "T").length,
      C: team.filter((player) => parseLegacyHeroString(player.hero?.displayName || player.hero)?.role === "C").length,
      N: team.filter((player) => parseLegacyHeroString(player.hero?.displayName || player.hero)?.role === "N").length,
    });
    const left = count(teamA);
    const right = count(teamB);
    return left.T === need.T && left.C === need.C && left.N === need.N && right.T === need.T && right.C === need.C && right.N === need.N && teamA.every((player) => player.hero) && teamB.every((player) => player.hero);
  }

  function shuffle(list) {
    const result = list.slice();
    for (let index = result.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(Math.random() * (index + 1));
      [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
    }
    return result;
  }

  function balanceTeamsByLevelLegacy(players, rivals) {
    const teamA = [];
    const teamB = [];
    const placed = new Set();
    const remaining = players.map((player) => ({ ...player, hero: null }));

    rivals.forEach((rival) => {
      const player1 = remaining.find((player) => player.name === rival.player1Name && !placed.has(player.name));
      const player2 = remaining.find((player) => player.name === rival.player2Name && !placed.has(player.name));
      if (player1 && player2) {
        if (Math.random() < 0.5) {
          teamA.push(player1);
          teamB.push(player2);
        } else {
          teamA.push(player2);
          teamB.push(player1);
        }
        placed.add(player1.name);
        placed.add(player2.name);
      }
    });

    const left = remaining.filter((player) => !placed.has(player.name));
    left.sort(() => Math.random() - 0.5);
    left.sort((leftPlayer, rightPlayer) => rightPlayer.level - leftPlayer.level);

    left.forEach((player) => {
      const sumA = teamA.reduce((sum, item) => sum + item.level, 0);
      const sumB = teamB.reduce((sum, item) => sum + item.level, 0);
      const rivalInA = hasRivalInTeamByName(player, teamA, rivals);
      const rivalInB = hasRivalInTeamByName(player, teamB, rivals);
      if (rivalInA && !rivalInB) teamB.push(player);
      else if (rivalInB && !rivalInA) teamA.push(player);
      else if (sumA <= sumB) teamA.push(player);
      else teamB.push(player);
    });

    while (teamA.length !== teamB.length) {
      if (teamA.length > teamB.length) {
        const player = teamA.pop();
        if (!hasRivalInTeamByName(player, teamB, rivals)) teamB.push(player);
        else teamA.push(player);
      } else {
        const player = teamB.pop();
        if (!hasRivalInTeamByName(player, teamA, rivals)) teamA.push(player);
        else teamB.push(player);
      }
    }

    return { teamA, teamB };
  }

  function buildRoleAssignmentPlanLegacy(team, requirements, boundHeroMap) {
    const remaining = { ...requirements };
    const plan = new Map();
    const unboundPlayers = [];

    for (const player of team) {
      const boundHero = boundHeroMap.get(player.name);
      if (!boundHero) {
        unboundPlayers.push(player);
        continue;
      }

      if (!player.preferredRole.includes(boundHero.role)) {
        return { error: `玩家「${player.name}」的专属英雄职责与位置偏好冲突，请调整偏好或专属英雄后重试` };
      }

      remaining[boundHero.role] -= 1;
      if (remaining[boundHero.role] < 0) {
        return { error: `当前队伍的玩家位置偏好和专属英雄无法满足 ${formatRoleRequirements(requirements)} 阵容要求` };
      }

      plan.set(player.name, boundHero.role);
    }

    function backtrack(players) {
      if (!players.length) {
        return Object.values(remaining).every((count) => count === 0);
      }

      const orderedPlayers = shuffle(players).sort((left, right) => {
        const leftOptions = left.preferredRole.filter((role) => remaining[role] > 0).length;
        const rightOptions = right.preferredRole.filter((role) => remaining[role] > 0).length;
        return leftOptions - rightOptions;
      });
      const [player, ...rest] = orderedPlayers;
      const roleOptions = shuffle(player.preferredRole.filter((role) => remaining[role] > 0));

      if (!roleOptions.length) {
        return false;
      }

      for (const role of roleOptions) {
        remaining[role] -= 1;
        plan.set(player.name, role);
        if (backtrack(rest)) {
          return true;
        }
        plan.delete(player.name);
        remaining[role] += 1;
      }

      return false;
    }

    if (!backtrack(unboundPlayers)) {
      return { error: `当前队伍的玩家位置偏好无法满足 ${formatRoleRequirements(requirements)} 阵容要求` };
    }

    return { plan };
  }

  function assignTeamHeroesLegacy(team, heroGroups, teamSize, binds, usedHeroes, normalizePreferredRoles) {
    const used = usedHeroes || new Set();
    const normalizeRoles = normalizePreferredRoles || normalizeRolesFallback;
    const boundHeroMap = new Map((binds || []).map((bind) => [bind.playerName, parseLegacyHeroString(bind.heroDisplayName)]));
    const cloned = team.map((player) => ({ ...player, hero: null, preferredRole: normalizeRoles(player.preferredRoles || player.preferredRole) }));
    const needs = getTeamRoleRequirements(teamSize);
    const rolePlanResult = buildRoleAssignmentPlanLegacy(cloned, needs, boundHeroMap);

    if (!rolePlanResult.plan) {
      return { error: rolePlanResult.error };
    }

    for (const player of cloned) {
      const boundHero = boundHeroMap.get(player.name);
      if (!boundHero) {
        continue;
      }

      if (used.has(boundHero.raw)) {
        return { error: `玩家「${player.name}」的专属英雄与当前分配冲突，请允许重复英雄或调整专属英雄后重试` };
      }

      player.hero = { name: boundHero.name, roleCode: boundHero.role, displayName: boundHero.raw };
      used.add(boundHero.raw);
    }

    for (const player of shuffle(cloned.filter((item) => !item.hero))) {
      const plannedRole = rolePlanResult.plan.get(player.name);
      const available = heroGroups[plannedRole].filter((hero) => !used.has(hero.raw));
      if (!available.length) {
        return { error: `${roleLabel(plannedRole)}英雄不足，无法按玩家位置偏好完成分配` };
      }

      const hero = available[Math.floor(Math.random() * available.length)];
      player.hero = { name: hero.name, roleCode: hero.role, displayName: hero.raw };
      used.add(hero.raw);
    }

    return { team: cloned.map((player) => ({ ...player, preferredRoles: normalizeRoles(player.preferredRole) })) };
  }

  function assignFixedTeamLegacy(team, heroPool, needT, needC, needN, allowCrossRepeat, globalUsed) {
    const result = [];
    const roles = [];
    for (let index = 0; index < needT; index += 1) roles.push("T");
    for (let index = 0; index < needC; index += 1) roles.push("C");
    for (let index = 0; index < needN; index += 1) roles.push("N");
    const shuffledTeam = shuffle(team.map((player) => ({ ...player })));

    for (let index = 0; index < shuffledTeam.length; index += 1) {
      const role = roles[index];
      let candidates = heroPool.filter((hero) => hero.startsWith(role + "-")).map((hero) => parseLegacyHeroString(hero)).filter(Boolean);
      candidates = candidates.filter((hero) => !result.some((item) => item.hero?.name === hero.name));
      if (!allowCrossRepeat) candidates = candidates.filter((hero) => !globalUsed.has(hero.name));
      if (!candidates.length) return null;
      const hero = candidates[Math.floor(Math.random() * candidates.length)];
      result.push({ ...shuffledTeam[index], hero: { name: hero.name, roleCode: hero.role, displayName: hero.raw } });
      globalUsed.add(hero.name);
    }

    return result;
  }

  function randomMapPayload(maps) {
    if (!maps.length) return null;
    const map = maps[Math.floor(Math.random() * maps.length)];
    return { id: map.id, name: map.name };
  }

  function buildRandomModeResult(options) {
    const normalizePreferredRoles = options.normalizePreferredRoles || normalizeRolesFallback;
    const sourcePlayers = (options.players || []).map((player) => clonePlayer(player, normalizePreferredRoles));
    const allowRepeatHeroes = options.allowRepeatHeroes !== false;
    const autoAssignHeroes = options.autoAssignHeroes !== false;

    if (![10, 12].includes(sourcePlayers.length)) {
      return { error: `人数错误，5v5 需要 10 人，6v6 需要 12 人，当前为 ${sourcePlayers.length} 人` };
    }

    const teamSize = sourcePlayers.length === 10 ? 5 : 6;
    const initialTeams = balanceTeamsByLevelLegacy(sourcePlayers, options.rivals || []);
    const initialLevelGap = Math.abs(
      initialTeams.teamA.reduce((sum, player) => sum + (Number(player.level) || 0), 0) -
      initialTeams.teamB.reduce((sum, player) => sum + (Number(player.level) || 0), 0)
    );

    if (!autoAssignHeroes) {
      return {
        payload: {
          selectedMap: randomMapPayload(options.maps || []),
          teams: { teamA: initialTeams.teamA, teamB: initialTeams.teamB },
          summary: { autoAssignHeroes: false, allowRepeatHeroes, levelGap: initialLevelGap, totalPlayers: sourcePlayers.length, teamSize },
        },
      };
    }

    const heroPool = (options.heroes || []).map((hero) => hero.displayName || `${hero.roleCode}-${hero.name}`);
    const allHeroes = heroPool.map(parseLegacyHeroString).filter(Boolean);
    const heroGroups = groupLegacyHeroesByRole(allHeroes);

    if (!allowRepeatHeroes) {
      const totalNeeds = teamSize === 5 ? { T: 2, C: 4, N: 4 } : { T: 4, C: 4, N: 4 };
      if (heroGroups.T.length < totalNeeds.T) return { error: `坦克总数不足，需要 ${totalNeeds.T}` };
      if (heroGroups.C.length < totalNeeds.C) return { error: `输出总数不足，需要 ${totalNeeds.C}` };
      if (heroGroups.N.length < totalNeeds.N) return { error: `辅助总数不足，需要 ${totalNeeds.N}` };
    } else {
      const needs = getTeamRoleRequirements(teamSize);
      if (heroGroups.T.length < needs.T) return { error: `坦克不足，每队需要 ${needs.T}` };
      if (heroGroups.C.length < needs.C) return { error: `输出不足，每队需要 ${needs.C}` };
      if (heroGroups.N.length < needs.N) return { error: `辅助不足，每队需要 ${needs.N}` };
    }

    let finalA = null;
    let finalB = null;
    let finalTeams = initialTeams;
    let valid = false;
    let lastError = "";
    for (let retry = 0; retry < 50; retry += 1) {
      finalTeams = balanceTeamsByLevelLegacy(sourcePlayers, options.rivals || []);
      const sharedUsed = new Set();
      const resultA = assignTeamHeroesLegacy(finalTeams.teamA, heroGroups, teamSize, options.binds || [], allowRepeatHeroes ? new Set() : sharedUsed, normalizePreferredRoles);
      if (!resultA.team) {
        lastError = resultA.error || lastError;
        continue;
      }

      const resultB = assignTeamHeroesLegacy(finalTeams.teamB, heroGroups, teamSize, options.binds || [], allowRepeatHeroes ? new Set() : sharedUsed, normalizePreferredRoles);
      if (!resultB.team) {
        lastError = resultB.error || lastError;
        continue;
      }

      finalA = resultA.team;
      finalB = resultB.team;
      valid = isValidAllocationLegacy(finalA, finalB, teamSize);
      if (valid) break;
      lastError = "英雄分配未能满足角色配置要求，请检查玩家位置偏好和英雄池后重试";
    }

    if (!finalA || !finalB || !valid) {
      return { error: lastError || "英雄分配未能满足角色配置要求，请扩大英雄池或允许两队重复英雄后重试" };
    }

    const levelGap = Math.abs(
      finalTeams.teamA.reduce((sum, player) => sum + (Number(player.level) || 0), 0) -
      finalTeams.teamB.reduce((sum, player) => sum + (Number(player.level) || 0), 0)
    );

    return {
      payload: {
        selectedMap: randomMapPayload(options.maps || []),
        teams: { teamA: finalA, teamB: finalB },
        summary: {
          autoAssignHeroes: true,
          allowRepeatHeroes,
          levelGap,
          totalPlayers: sourcePlayers.length,
          teamSize,
          warning: "",
        },
      },
    };
  }

  global.RandomModeHelpers = {
    shuffle,
    parseLegacyHeroString,
    groupLegacyHeroesByRole,
    getTeamRoleRequirements,
    isValidAllocationLegacy,
    hasRivalInTeamByName,
    balanceTeamsByLevelLegacy,
    assignTeamHeroesLegacy,
    assignFixedTeamLegacy,
    randomMapPayload,
    buildRandomModeResult,
    normalizeRolesFallback,
  };
})(window);
