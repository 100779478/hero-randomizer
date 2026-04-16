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

  function assignTeamHeroesLegacy(team, heroGroups, teamSize, binds, usedHeroes, normalizePreferredRoles) {
    const used = usedHeroes || new Set();
    const normalizeRoles = normalizePreferredRoles || normalizeRolesFallback;
    const boundMap = new Map((binds || []).map((bind) => [bind.playerName, bind.heroDisplayName]));
    const cloned = team.map((player) => ({ ...player, hero: null, preferredRole: normalizeRoles(player.preferredRoles || player.preferredRole) }));
    const needs = getTeamRoleRequirements(teamSize);

    cloned.forEach((player) => {
      const heroName = boundMap.get(player.name);
      if (heroName && !used.has(heroName)) {
        const heroInfo = parseLegacyHeroString(heroName);
        if (heroInfo) {
          player.hero = { name: heroInfo.name, roleCode: heroInfo.role, displayName: heroInfo.raw };
          used.add(heroName);
        }
      }
    });

    const current = { T: 0, C: 0, N: 0 };
    cloned.forEach((player) => {
      const role = player.hero?.roleCode;
      if (role && current[role] !== undefined) current[role] += 1;
    });

    const unassigned = cloned.filter((player) => !player.hero);
    const finalMustT = unassigned.filter((player) => player.preferredRole.join(",") === "T");
    const finalMustN = unassigned.filter((player) => player.preferredRole.join(",") === "N");
    const finalMustC = unassigned.filter((player) => player.preferredRole.join(",") === "C");
    const canT = unassigned.filter((player) => player.preferredRole.includes("T") && !finalMustT.some((item) => item.name === player.name));
    const canN = unassigned.filter((player) => player.preferredRole.includes("N") && !finalMustN.some((item) => item.name === player.name));
    const canC = unassigned.filter((player) => player.preferredRole.includes("C") && !finalMustC.some((item) => item.name === player.name));

    function tryAssign(player, role) {
      if (current[role] >= needs[role]) return false;
      const available = heroGroups[role].filter((hero) => !used.has(hero.raw));
      if (!available.length) return false;
      const hero = available[Math.floor(Math.random() * available.length)];
      player.hero = { name: hero.name, roleCode: hero.role, displayName: hero.raw };
      used.add(hero.raw);
      current[role] += 1;
      return true;
    }

    let success = true;
    [{ role: "T", list: finalMustT }, { role: "N", list: finalMustN }, { role: "C", list: finalMustC }].forEach((group) => {
      group.list.forEach((player) => {
        if (!player.hero && !tryAssign(player, group.role)) success = false;
      });
    });
    if (!success) return null;

    shuffle([].concat(canT, canN, canC)).forEach((player) => {
      if (player.hero) return;
      const roles = player.preferredRole.filter((role) => current[role] < needs[role]);
      if (!roles.length) return;
      tryAssign(player, roles[Math.floor(Math.random() * roles.length)]);
    });

    shuffle(cloned.filter((player) => !player.hero)).forEach((player) => {
      const roles = ["T", "N", "C"].filter((role) => current[role] < needs[role]);
      if (!roles.length) {
        const pool = heroGroups.ALL.filter((hero) => !used.has(hero.raw));
        if (pool.length) {
          const hero = pool[Math.floor(Math.random() * pool.length)];
          player.hero = { name: hero.name, roleCode: hero.role, displayName: hero.raw };
          used.add(hero.raw);
        }
        return;
      }
      const role = roles[Math.floor(Math.random() * roles.length)];
      if (!tryAssign(player, role)) {
        roles.forEach((item) => {
          if (!player.hero) tryAssign(player, item);
        });
      }
    });

    return cloned.map((player) => ({ ...player, preferredRoles: normalizeRoles(player.preferredRole) }));
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

    const balancedTeams = balanceTeamsByLevelLegacy(sourcePlayers, options.rivals || []);
    const teamSize = sourcePlayers.length === 10 ? 5 : 6;
    const levelGap = Math.abs(
      balancedTeams.teamA.reduce((sum, player) => sum + (Number(player.level) || 0), 0) -
      balancedTeams.teamB.reduce((sum, player) => sum + (Number(player.level) || 0), 0)
    );

    if (!autoAssignHeroes) {
      return {
        payload: {
          selectedMap: randomMapPayload(options.maps || []),
          teams: { teamA: balancedTeams.teamA, teamB: balancedTeams.teamB },
          summary: { autoAssignHeroes: false, allowRepeatHeroes, levelGap, totalPlayers: sourcePlayers.length, teamSize },
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
    let valid = false;
    for (let retry = 0; retry <= 10; retry += 1) {
      const sharedUsed = new Set();
      finalA = assignTeamHeroesLegacy(balancedTeams.teamA, heroGroups, teamSize, options.binds || [], allowRepeatHeroes ? new Set() : sharedUsed, normalizePreferredRoles);
      finalB = assignTeamHeroesLegacy(balancedTeams.teamB, heroGroups, teamSize, options.binds || [], allowRepeatHeroes ? new Set() : sharedUsed, normalizePreferredRoles);
      if (!finalA || !finalB) continue;
      valid = isValidAllocationLegacy(finalA, finalB, teamSize);
      if (valid) break;
    }

    if (!finalA || !finalB) {
      return { error: "当前英雄池或位置偏好无法完成分配" };
    }

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
          warning: valid ? "" : "位置分布未完全符合旧版要求，已返回当前最接近结果，可继续重抽。",
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
