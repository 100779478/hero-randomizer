// 所有玩家
const allPlayers = [];
const teamA = [];
const teamB = [];
const modal = document.getElementById('modal');
const rollText = document.getElementById('rollText');
const finalResult = document.getElementById('finalResult');
const rivalModal = document.getElementById('rivalModal');

// 宿敌与绑定系统
const rivals = []; // 宿敌对 [{player1, player2}]
const heroBinds = []; // 英雄绑定 [{player, hero}]

let heroPool = Array.isArray(window.DEFAULT_HERO_POOL) ? window.DEFAULT_HERO_POOL.slice() : [];

const presetPlayers = Array.isArray(window.PRESET_PLAYERS) ? window.PRESET_PLAYERS : [];

// 获取可用的预设玩家（过滤掉已添加的玩家）
function getAvailablePresetPlayers() {
    return presetPlayers.filter(presetPlayer =>
        !allPlayers.some(addedPlayer => addedPlayer.name === presetPlayer.name)
    );
}

// 初始化
document.addEventListener('DOMContentLoaded', function () {
    renderHeroPool();
    renderPlayerList();
    renderPlayerSelector()
    setupEventListeners();
});

// 设置事件监听器
function setupEventListeners() {
    // 英雄管理
    document.getElementById('addHeroBtn').addEventListener('click', addHero);
    document.getElementById('resetHeroPoolBtn').addEventListener('click', resetHeroPool);

    // 玩家管理
    document.getElementById('addPlayerBtn').addEventListener('click', addPlayer);
    document.getElementById('clearPlayersBtn').addEventListener('click', clearPlayers);

    // 宿敌与绑定事件
    document.getElementById('addRivalBtn').addEventListener('click', addRival);
    document.getElementById('addBindBtn').addEventListener('click', addHeroBind);
    document.getElementById('closeRivalModal').addEventListener('click', closeRivalModal);
    document.getElementById('clearRivalsBtn').addEventListener('click', clearRivals);

    // 开始抽取
    document.getElementById('startBtn').addEventListener('click', startDraw);

    // 双击底部显示宿敌设置
    document.getElementById('footer').addEventListener('dblclick', showRivalModal);

    // 点击弹窗外部关闭
    rivalModal.addEventListener('click', function (e) {
        if (e.target === rivalModal) {
            closeRivalModal();
        }
    });

    // 玩家名称输入框事件 - 添加过滤功能
    const playerNameInput = document.getElementById('playerNameInput');

    playerNameInput.addEventListener('input', function (e) {
        const query = e.target.value.trim().toLowerCase();
        filterPlayerOptions(query);
    });

    // 回车键添加玩家
    playerNameInput.addEventListener('keypress', function (e) {
        if (e.key === 'Enter') {
            addPlayer();
        }
    });
}

// 过滤玩家选项
function filterPlayerOptions(query) {
    const playerSelector = document.getElementById('playerSelector');
    const playerOptions = playerSelector.querySelectorAll('.player-option');

    let hasVisibleOptions = false;

    playerOptions.forEach(option => {
        const playerNameElement = option.querySelector('div[onclick]');
        const playerName = playerNameElement.textContent.toLowerCase();

        // 检查是否匹配（包含匹配）
        if (!query || playerName.includes(query)) {
            option.style.display = 'block';
            hasVisibleOptions = true;
        } else {
            option.style.display = 'none';
        }
    });

    // 更新空状态显示
    const emptyState = playerSelector.querySelector('.empty-state');
    if (emptyState) {
        if (!hasVisibleOptions && query) {
            emptyState.textContent = '没有找到匹配的玩家';
            emptyState.style.display = 'block';
        } else if (!hasVisibleOptions && !query) {
            emptyState.textContent = '所有玩家都已添加';
            emptyState.style.display = 'block';
        } else {
            emptyState.style.display = 'none';
        }
    }
}

// 显示宿敌设置弹窗
function showRivalModal() {
    updateRivalSelectors();
    rivalModal.style.display = 'flex';
}

// 关闭宿敌设置弹窗
function closeRivalModal() {
    rivalModal.style.display = 'none';
}

// 清空所有宿敌和绑定
function clearRivals() {
    if (confirm('确定要清空所有敌对关系和英雄绑定吗？')) {
        rivals.length = 0;
        heroBinds.length = 0;
        renderRivalList();
        renderBindList();
    }
}

// 更新宿敌选择器
function updateRivalSelectors() {
    const rivalSelect1 = document.getElementById('rivalPlayer1');
    const rivalSelect2 = document.getElementById('rivalPlayer2');
    const bindSelect = document.getElementById('bindPlayer');
    const bindHeroSelect = document.getElementById('bindHero');

    // 清空选项
    rivalSelect1.innerHTML = '<option value="">选择玩家1</option>';
    rivalSelect2.innerHTML = '<option value="">选择玩家2</option>';
    bindSelect.innerHTML = '<option value="">选择玩家</option>';
    // 添加玩家选项
    allPlayers.forEach(player => {
        const option = `<option value="${player.name}">${player.name}</option>`;
        rivalSelect1.innerHTML += option;
        rivalSelect2.innerHTML += option;
        bindSelect.innerHTML += option;
    });

    // 更新英雄选择器
    bindHeroSelect.innerHTML = '<option value="">选择英雄</option>';
    heroPool.forEach(hero => {
        bindHeroSelect.innerHTML += `<option value="${hero}">${hero}</option>`;
    });

}

// 添加宿敌
function addRival() {
    const player1 = document.getElementById('rivalPlayer1').value;
    const player2 = document.getElementById('rivalPlayer2').value;

    if (!player1 || !player2) {
        alert('请选择两名玩家！');
        return;
    }

    if (player1 === player2) {
        alert('不能选择同一名玩家！');
        return;
    }

    // 检查是否已存在
    const exists = rivals.some(r =>
        (r.player1 === player1 && r.player2 === player2) ||
        (r.player1 === player2 && r.player2 === player1)
    );

    if (exists) {
        alert('这对sb已存在！');
        return;
    }

    rivals.push({player1, player2});
    renderRivalList();

    // 清空选择
    document.getElementById('rivalPlayer1').value = '';
    document.getElementById('rivalPlayer2').value = '';
}

// 渲染宿敌列表
function renderRivalList() {
    const rivalList = document.getElementById('rivalList');
    if (rivals.length === 0) {
        rivalList.innerHTML = '<div style="color: #888; padding: 10px;">暂无敌对设置</div>';
        return;
    }
    rivalList.innerHTML = rivals.map((rival, index) => `
            <div class="rival-item">
                <span>${rival.player1} 🆚 ${rival.player2}</span>
                <button class="remove-rival-btn" onclick="removeRival(${index})">删除</button>
            </div>
        `).join('');
}

// 删除宿敌
function removeRival(index) {
    rivals.splice(index, 1);
    renderRivalList();
}

// 添加英雄绑定
function addHeroBind() {
    const player = document.getElementById('bindPlayer').value;
    const hero = document.getElementById('bindHero').value;
    if (!player || !hero) {
        alert('请选择玩家和英雄！');
        return;
    }

    // 检查是否已存在
    const exists = heroBinds.some(b => b.player === player);
    if (exists) {
        alert('该玩家已有英雄绑定！');
        return;
    }

    heroBinds.push({player, hero});
    renderBindList();

    // 清空选择
    document.getElementById('bindPlayer').value = '';
    document.getElementById('bindHero').value = '';
}

// 渲染绑定列表
function renderBindList() {
    const bindList = document.getElementById('bindList');
    if (heroBinds.length === 0) {
        bindList.innerHTML = '<div style="color: #888; padding: 10px;">暂无英雄绑定</div>';
        return;
    }

    bindList.innerHTML = heroBinds.map((bind, index) => `
            <div class="bind-item">
                <span>${bind.player} → ${bind.hero}</span>
                <button class="remove-bind-btn" onclick="removeHeroBind(${index})">删除</button>
            </div>
        `).join('');
}

// 删除英雄绑定
function removeHeroBind(index) {
    heroBinds.splice(index, 1);
    renderBindList();
}

// 渲染英雄池
function renderHeroPool() {
    const heroPoolDisplay = document.getElementById('heroPoolDisplay');
    heroPoolDisplay.innerHTML = heroPool.map((hero, index) => {
        const heroInfo = parseHero(hero);
        let roleClass = '';
        if (heroInfo) {
            if (heroInfo.role === 'T') roleClass = 'tank';
            else if (heroInfo.role === 'N') roleClass = 'support';
            else if (heroInfo.role === 'C') roleClass = 'damage';
        }
        return `
                <div class="hero-item ${roleClass}">
                    ${hero}
                    <button class="hero-remove-btn" onclick="removeHero(${index})">×</button>
                </div>
            `;
    }).join('');
}

// 添加英雄
function addHero() {
    const heroInput = document.getElementById('heroInput');
    const hero = heroInput.value.trim();

    if (!hero) {
        alert('请输入英雄名称！');
        return;
    }

    // 检查格式
    const heroInfo = parseHero(hero);
    if (!heroInfo) {
        alert('英雄格式不正确！请使用格式：T-坦克名, N-支援名, C-输出名');
        return;
    }

    // 检查是否已存在
    if (heroPool.includes(hero)) {
        alert('该英雄已存在！');
        return;
    }

    heroPool.push(hero);
    renderHeroPool();
    heroInput.value = '';
}

// 删除英雄
function removeHero(index) {
    heroPool.splice(index, 1);
    renderHeroPool();
}

// 重置英雄池
function resetHeroPool() {
    if (confirm('确定要重置英雄池吗？这将恢复默认英雄列表。')) {
        heroPool = Array.isArray(window.DEFAULT_HERO_POOL) ? window.DEFAULT_HERO_POOL.slice() : [];
        renderHeroPool();
    }
}

// 渲染玩家选择器
function renderPlayerSelector() {
    const playerSelector = document.getElementById('playerSelector');
    const availablePlayers = getAvailablePresetPlayers();

    if (availablePlayers.length === 0) {
        playerSelector.innerHTML = '<div class="empty-state">所有玩家都已添加</div>';
        return;
    }

    playerSelector.innerHTML = availablePlayers.map((player, index) => `
            <div class="player-option">
                <div onclick="addPlayerFromList('${player.name}', getSelectedRole(${index}))"
                     style="cursor: pointer; border-radius: 6px; font-size: 12px;background: #2a2a2a;">
                    ${player.name}
                </div>
                <div class="role-selector" id="roleSelector-${index}">
                    <div class="role-option-btn role-any ${player.preferredRole === 'any' ? 'selected' : null}"
                         onclick="selectRole(${index}, 'any')">任意</div>
                    <div class="role-option-btn role-t ${player.preferredRole === 'T' ? 'selected' : null}"
                         onclick="selectRole(${index}, 'T')">🛡️坦克</div>
                    <div class="role-option-btn role-c ${player.preferredRole === 'C' ? 'selected' : null}"
                         onclick="selectRole(${index}, 'C')">⚔️输出</div>
                    <div class="role-option-btn role-n ${player.preferredRole === 'N' ? 'selected' : null}"
                         onclick="selectRole(${index}, 'N')">🩹治疗</div>
                </div>
            </div>
        `).join('');

    // 确保所有选项默认显示
    const playerOptions = playerSelector.querySelectorAll('.player-option');
    playerOptions.forEach(option => {
        option.style.display = 'block';
    });
}

// 选择角色
function selectRole(index, role) {
    const roleSelector = document.getElementById(`roleSelector-${index}`);
    const buttons = roleSelector.querySelectorAll('.role-option-btn');

    buttons.forEach(btn => {
        btn.classList.remove('selected');
    });

    event.target.classList.add('selected');
}

// 获取选中的角色
function getSelectedRole(index) {
    const roleSelector = document.getElementById(`roleSelector-${index}`);
    const selectedBtn = roleSelector.querySelector('.role-option-btn.selected');
    console.log(selectedBtn.textContent)
    return selectedBtn.textContent === '任意' ? 'any' :
        selectedBtn.textContent === '🛡️坦克' ? 'T' :
            selectedBtn.textContent === '⚔️输出' ? 'C' : 'N';
}

// 从列表添加玩家
function addPlayerFromList(playerName, selectedRole = 'any') {
    const player = presetPlayers.find(p => p.name === playerName);
    if (!player) return;

    // 检查是否已存在
    if (!allPlayers.some(p => p.name === player.name)) {
        allPlayers.push({
            ...player,
            hero: '',
            preferredRole: selectedRole
        });
        renderPlayerList();
        renderPlayerSelector(); // 重新渲染选择器，移除已添加的玩家

        // 清空输入框并重置过滤器
        document.getElementById('playerNameInput').value = '';
        filterPlayerOptions('');
    }
}

// 清空玩家列表
function clearPlayers() {
    if (allPlayers.length === 0) {
        alert('玩家列表已经是空的！');
        return;
    }

    if (confirm('确定要清空所有玩家吗？')) {
        allPlayers.length = 0;
        renderPlayerList();
        renderPlayerSelector(); // 重新渲染选择器，恢复所有玩家

        // 同时清空宿敌和绑定
        rivals.length = 0;
        heroBinds.length = 0;
        renderRivalList();
        renderBindList();

        // 清空输入框并重置过滤器
        document.getElementById('playerNameInput').value = '';
        filterPlayerOptions('');
    }
}

// 添加玩家
function addPlayer() {
    const nameInput = document.getElementById('playerNameInput');
    const levelInput = document.getElementById('playerLevelInput');
    const roleInput = document.getElementById('playerRoleInput');
    const name = nameInput.value.trim();
    const level = parseInt(levelInput.value) || 1;
    const preferredRole = roleInput.value;

    if (!name) {
        alert('请输入玩家名称！');
        return;
    }

    if (allPlayers.some(p => p.name === name)) {
        alert('该玩家已存在！');
        return;
    }

    allPlayers.push({
        name,
        level,
        hero: '',
        preferredRole
    });
    renderPlayerList();

    // 清空输入
    nameInput.value = '';
    nameInput.focus();
    levelInput.value = '3';
    roleInput.value = 'any';

    // 重新渲染选择器，恢复所有选项显示
    renderPlayerSelector();
}

// 渲染玩家列表
function renderPlayerList() {
    const playerList = document.getElementById('playerList');
    playerList.innerHTML = allPlayers.map((player, index) => {
        const roleName = player.preferredRole === 'any' ? '任意' :
            player.preferredRole === 'T' ? '🛡️坦克' :
                player.preferredRole === 'C' ? '⚔️输出' : '🩹支援';

        return `
                <div class="player-item">
                    <span class="name">${player.name}</span>
                    <span class="role-info">${roleName}</span>
                    <button class="remove-btn" onclick="removePlayer(${index})">×</button>
                </div>
            `;
    }).join('');
}

// 删除玩家
function removePlayer(index) {
    const playerName = allPlayers[index].name;
    allPlayers.splice(index, 1);
    renderPlayerList();
    renderPlayerSelector(); // 重新渲染选择器，恢复被删除的玩家

    // 同时移除相关的宿敌和绑定
    removePlayerFromRivalsAndBinds(playerName);
}

// 当玩家被删除时，清理相关的宿敌和绑定
function removePlayerFromRivalsAndBinds(playerName) {
    // 移除宿敌
    for (let i = rivals.length - 1; i >= 0; i--) {
        if (rivals[i].player1 === playerName || rivals[i].player2 === playerName) {
            rivals.splice(i, 1);
        }
    }
    renderRivalList();

    // 移除绑定
    for (let i = heroBinds.length - 1; i >= 0; i--) {
        if (heroBinds[i].player === playerName) {
            heroBinds.splice(i, 1);
        }
    }
    renderBindList();
}

// 根据等级和位置偏好平衡分队（支持宿敌系统）
// 终极版：只管实力均衡 + 宿敌分离，位置一律不管！
function balanceTeamsByLevel() {
    teamA.length = 0;
    teamB.length = 0;

    // Step 1: 宿敌强制分开（优先级最高）
    const placed = new Set();
    const remaining = [...allPlayers];

    rivals.forEach(r => {
        const p1 = remaining.find(p => p.name === r.player1 && !placed.has(p.name));
        const p2 = remaining.find(p => p.name === r.player2 && !placed.has(p.name));
        if (p1 && p2) {
            if (Math.random() < 0.5) {
                teamA.push(p1);
                teamB.push(p2);
            } else {
                teamA.push(p2);
                teamB.push(p1);
            }
            placed.add(p1.name);
            placed.add(p2.name);
        }
    });

    // Step 2: 剩余玩家彻底随机打乱 + 按等级降序（只为实力均衡）
    let left = remaining.filter(p => !placed.has(p.name));
    left.sort(() => Math.random() - 0.5);           // 彻底打乱
    left.sort((a, b) => b.level - a.level);         // 再按等级排序，保证贪心均衡

    // Step 3: 贪心分配：永远给当前总等级更低的队
    left.forEach(player => {
        const sumA = teamA.reduce((s, p) => s + p.level, 0);
        const sumB = teamB.reduce((s, p) => s + p.level, 0);

        const rivalInA = hasRivalInTeam(player, teamA);
        const rivalInB = hasRivalInTeam(player, teamB);

        if (rivalInA && !rivalInB) {
            teamB.push(player);
        } else if (rivalInB && !rivalInA) {
            teamA.push(player);
        } else if (sumA <= sumB) {
            teamA.push(player);
        } else {
            teamB.push(player);
        }
    });

    // Step 4: 人数不均时强制平衡（极少发生）
    while (teamA.length !== teamB.length) {
        if (teamA.length > teamB.length) {
            const p = teamA.pop();
            if (!hasRivalInTeam(p, teamB)) teamB.push(p);
            else teamA.push(p); // 放回去，下次再试
        } else {
            const p = teamB.pop();
            if (!hasRivalInTeam(p, teamA)) teamA.push(p);
            else teamB.push(p);
        }
    }

    console.log("分队完成：总等级差 ≤1，宿敌已分离，位置完全随机分配");
}

// 检查玩家在某个队伍中是否有宿敌
function hasRivalInTeam(player, team) {
    return rivals.some(rival => {
        if (rival.player1 === player.name) {
            return team.some(p => p.name === rival.player2);
        }
        if (rival.player2 === player.name) {
            return team.some(p => p.name === rival.player1);
        }
        return false;
    });
}

// 分配任意位置玩家到队伍（考虑宿敌关系）
function assignAnyPlayerToTeamWithRivalCheck(player, teamAScore, teamBScore) {
    const rivalInTeamA = hasRivalInTeam(player, teamA);
    const rivalInTeamB = hasRivalInTeam(player, teamB);
    // 如果在一队有宿敌，就分配到另一队
    if (rivalInTeamA && !rivalInTeamB) {
        teamB.push(player);
    } else if (rivalInTeamB && !rivalInTeamA) {
        teamA.push(player);
    } else if (!rivalInTeamA && !rivalInTeamB) {
        // 两队都没有宿敌，按等级平衡分配
        if (teamAScore < teamBScore) {
            teamA.push(player);
        } else if (teamAScore > teamBScore) {
            teamB.push(player);
        } else {
            // 等级相同时随机分配
            if (Math.random() > 0.5) {
                teamA.push(player);
            } else {
                teamB.push(player);
            }
        }
    } else {
        // 两队都有宿敌（理论上不应该发生），随机分配
        if (Math.random() > 0.5) {
            teamA.push(player);
        } else {
            teamB.push(player);
        }
    }
}

// 确保两队人数相等
function ensureEqualTeamSizes() {
    while (Math.abs(teamA.length - teamB.length) > 0) {
        if (teamA.length > teamB.length) {
            // 从A队移动一个玩家到B队
            const playerToMove = findOptimalPlayerToMove(teamA, teamB);
            if (playerToMove) {
                const index = teamA.indexOf(playerToMove);
                teamA.splice(index, 1);
                teamB.push(playerToMove);
            } else {
                break;
            }
        } else {
            // 从B队移动一个玩家到A队
            const playerToMove = findOptimalPlayerToMove(teamB, teamA);
            if (playerToMove) {
                const index = teamB.indexOf(playerToMove);
                teamB.splice(index, 1);
                teamA.push(playerToMove);
            } else {
                break;
            }
        }
    }
}

// 更智能的玩家移动选择（带随机性）
function findOptimalPlayerToMove(fromTeam, toTeam) {
    const totalPlayers = fromTeam.length + toTeam.length;
    const is5v5 = totalPlayers === 10;
    const requiredTanks = is5v5 ? 1 : 2;
    const requiredSupports = 2;
    const requiredDamage = is5v5 ? 2 : 2;

    // 分析目标队的角色分布
    const toRoles = {
        tank: toTeam.filter(p => p.preferredRole === 'T').length,
        support: toTeam.filter(p => p.preferredRole === 'N').length,
        damage: toTeam.filter(p => p.preferredRole === 'C').length
    };

    // 如果目标队某个位置过少，不移走该位置
    const rolesToAvoid = [];
    if (toRoles.tank < requiredTanks) {
        rolesToAvoid.push('T');
    }
    if (toRoles.support < requiredSupports) {
        rolesToAvoid.push('N');
    }
    if (toRoles.damage < requiredDamage) {
        rolesToAvoid.push('C');
    }

    // 筛选候选人 - 优先移动等级较低的玩家
    let candidates = fromTeam.filter(player =>
        !rolesToAvoid.includes(player.preferredRole)
    );

    // 如果还有选择余地，优先移动重复的角色
    if (candidates.length > 1) {
        const roleCounts = {};
        candidates.forEach(player => {
            roleCounts[player.preferredRole] = (roleCounts[player.preferredRole] || 0) + 1;
        });

        // 找出数量最多的角色类型
        const maxRole = Object.keys(roleCounts).reduce((a, b) =>
            roleCounts[a] > roleCounts[b] ? a : b
        );

        candidates = candidates.filter(player => player.preferredRole === maxRole);
    }

    // 如果还有多个候选人，随机选择一个
    if (candidates.length > 1) {
        // 先按等级排序，然后从等级较低的玩家中随机选择
        candidates.sort((a, b) => a.level - b.level);
        const lowestLevel = candidates[0].level;
        const lowLevelCandidates = candidates.filter(p => p.level === lowestLevel);
        return lowLevelCandidates[Math.floor(Math.random() * lowLevelCandidates.length)];
    }

    if (candidates.length > 0) {
        return candidates[0];
    }

    // 如果没有合适选择，随机选择一个玩家
    return fromTeam[Math.floor(Math.random() * fromTeam.length)];
}

// 随机整数生成
function rndInt(max) {
    return Math.floor(Math.random() * max);
}

// 解析英雄
function parseHero(heroStr) {
    const str = (heroStr || '').trim();
    if (!str) return null;

    const dashIndex = str.indexOf('-');
    if (dashIndex > 0) {
        const role = str.slice(0, dashIndex).trim().toUpperCase();
        const name = str.slice(dashIndex + 1).trim();
        if (['T', 'N', 'C'].includes(role)) {
            return {role, name, raw: str};
        }

        const firstChar = str[0].toUpperCase();
        if (['T', 'N', 'C'].includes(firstChar)) {
            return {role: firstChar, name: str.slice(1).trim() || str, raw: str};
        }

        return {role: 'C', name: str, raw: str};
    } else {
        const firstChar = str[0].toUpperCase();
        if (['T', 'N', 'C'].includes(firstChar) && str.length > 2 && str[1] === '-') {
            return {role: firstChar, name: str.slice(2).trim(), raw: str};
        }

        const firstChar2 = str[0].toUpperCase();
        if (['T', 'N', 'C'].includes(firstChar2)) {
            return {role: firstChar2, name: str.slice(1).trim() || str, raw: str};
        }

        return {role: 'C', name: str, raw: str};
    }
}

// 按角色分组英雄
function groupHeroesByRole(heroes) {
    return {
        'T': heroes.filter(h => h.role === 'T'),
        'N': heroes.filter(h => h.role === 'N'),
        'C': heroes.filter(h => h.role === 'C'),
        'ALL': heroes.slice()
    };
}

// 为队伍分配英雄（考虑位置偏好和英雄绑定）
// 终极版：优先满足位置偏好 + 彻底杜绝高等级垄断
function assignTeamHeroes(team, heroGroups, teamSize, roleRequirements, usedHeroes = null) {
    const used = usedHeroes || new Set();
    team.forEach(p => p.hero = '');

    const is5v5 = teamSize === 5;
    const needT = is5v5 ? 1 : 2;
    const needN = 2;
    const needC = is5v5 ? 2 : 2;

    // 1. 处理英雄绑定（不变）
    team.forEach(player => {
        const bind = heroBinds.find(b => b.player === player.name);
        if (bind && !used.has(bind.hero)) {
            player.hero = bind.hero;
            used.add(bind.hero);
        }
    });

    // 2. 关键改动：把队伍彻底打乱！让等级彻底失去意义
    const shuffled = [...team].sort(() => Math.random() - 0.5);

    // 3. 分离出“有明确偏好”和“无偏好/any”的玩家
    const wantTank = shuffled.filter(p => p.preferredRole === 'T' && !p.hero);
    const wantSupport = shuffled.filter(p => p.preferredRole === 'N' && !p.hero);
    const wantDamage = shuffled.filter(p => p.preferredRole === 'C' && !p.hero);
    const flexible = shuffled.filter(p => !p.hero && (p.preferredRole === 'any' || p.preferredRole == null));

    // 4. 优先分配：有偏好的玩家先吃到对应位置（顺序已随机，不受等级影响）
    const assignRole = (players, role, count, heroList) => {
        let available = heroList.filter(h => !used.has(h.raw));
        for (let i = 0; i < count && players.length > 0 && available.length > 0; i++) {
            const player = players.shift();  // 按随机顺序拿
            const hero = available.splice(rndInt(available.length), 1)[0];
            player.hero = hero.raw;
            used.add(hero.raw);
        }
    };

    assignRole(wantTank, 'T', needT, heroGroups.T);
    assignRole(wantSupport, 'N', needN, heroGroups.N);
    assignRole(wantDamage, 'C', needC, heroGroups.C);

    // 5. 剩余位置用 flexible 玩家随机填补
    const remainingPlayers = shuffled.filter(p => !p.hero);
    let currentT = team.filter(p => parseHero(p.hero)?.role === 'T').length;
    let currentN = team.filter(p => parseHero(p.hero)?.role === 'N').length;
    let currentC = team.filter(p => parseHero(p.hero)?.role === 'C').length;

    const fill = (role, need, list) => {
        let avail = list.filter(h => !used.has(h.raw));
        while (need > 0 && remainingPlayers.length > 0 && avail.length > 0) {
            const player = remainingPlayers.shift();
            const hero = avail.splice(rndInt(avail.length), 1)[0];
            player.hero = hero.raw;
            used.add(hero.raw);
            need--;
        }
        return need;
    };

    currentT = needT - currentT;
    currentN = needN - currentN;
    currentC = needC - currentC;

    if (currentT > 0) currentT = fill('T', currentT, heroGroups.T);
    if (currentN > 0) currentN = fill('N', currentN, heroGroups.N);
    if (currentC > 0) currentC = fill('C', currentC, heroGroups.C);

    if (currentT > 0 || currentN > 0 || currentC > 0) {
        return {ok: false, reason: '英雄不足'};
    }

    return {ok: true};
}

// 开始抽取
async function startDraw() {
    if (allPlayers.length === 0) return alert('请添加至少一名玩家！');

    const totalPlayers = allPlayers.length;
    if (totalPlayers !== 10 && totalPlayers !== 12) return alert('人数错误！5v5 需10人，6v6 需12人。');

    // 平衡分队
    balanceTeamsByLevel();

    // 验证队伍平衡
    if (teamA.length !== teamB.length) {
        console.warn(`队伍人数不均衡: A队${teamA.length}人 vs B队${teamB.length}人，尝试重新平衡...`);
        ensureEqualTeamSizes();
    }

    console.log(`分队完成: A队${teamA.length}人, B队${teamB.length}人`);

    const allowRepeat = document.getElementById('allowRepeat').checked;
    const randomHero = document.getElementById('randomHero').checked; // 获取随机英雄开关状态
    const is5v5 = totalPlayers === 10;
    const teamSize = is5v5 ? 5 : 6;

    const allHeroes = heroPool.map(parseHero).filter(Boolean);
    const heroGroups = groupHeroesByRole(allHeroes);

    // 显示抽取动画
    modal.style.display = 'flex';
    finalResult.style.display = 'none';
    rollText.style.display = 'block';

    let rollInterval = setInterval(() => {
        const randomHero = allHeroes[rndInt(allHeroes.length)];
        rollText.textContent = randomHero ? randomHero.name : '抽取中...';
    }, 50);

    await new Promise(resolve => setTimeout(resolve, 1400));

    // 如果不随机英雄，直接显示结果
    if (!randomHero) {
        clearInterval(rollInterval);

        // 清空英雄分配
        teamA.forEach(player => player.hero = '');
        teamB.forEach(player => player.hero = '');

        // 显示最终结果（不显示英雄列）
        rollText.style.display = 'none';
        finalResult.style.display = 'block';
        const randomItem = window.MAP[Math.floor(Math.random() * window.MAP.length)];
        finalResult.innerHTML = `
                <h3>分队结果</h3>
                <div style="text-align:center;color:#eaecef;font-size:20px;font-weight:bold;margin:18px 0;">地图：${randomItem}</div>
                <table>
                    <thead><tr><th>队伍</th><th>玩家</th><th>偏好位置</th></tr></thead>
                    <tbody>
                        ${teamA.map(player => {
            const preferredRoleName = player.preferredRole === 'any' ? '任意' :
                player.preferredRole === 'T' ? '🛡️坦克' :
                    player.preferredRole === 'C' ? '⚔️输出' : '🩹支援';
            return `
                                <tr class="teamA-row">
                                    <td>A 队</td>
                                    <td>${player.name}</td>
                                    <td>${preferredRoleName}</td>
                                </tr>
                            `;
        }).join('')}
                        ${teamB.map(player => {
            const preferredRoleName = player.preferredRole === 'any' ? '任意' :
                player.preferredRole === 'T' ? '🛡️坦克' :
                    player.preferredRole === 'C' ? '⚔️输出' : '🩹支援';
            return `
                                <tr class="teamB-row">
                                    <td>B 队</td>
                                    <td>${player.name}</td>
                                    <td>${preferredRoleName}</td>
                                </tr>
                            `;
        }).join('')}
                    </tbody>
                </table>
                <div style="margin-top:12px;">
                    <button id="closeModalBtn" class="small-btn">关闭</button>
                    <button id="reDrawBtn" class="small-btn" style="margin-left:10px;">重新分队</button>
                </div>
            `;

        document.getElementById('closeModalBtn').onclick = () => modal.style.display = 'none';
        document.getElementById('reDrawBtn').onclick = () => {
            // 禁用按钮防止重复点击
            document.getElementById('reDrawBtn').disabled = true;
            setTimeout(() => document.getElementById('reDrawBtn').disabled = false, 500);

            // 重新开始抽取
            modal.style.display = 'none';
            startDraw();
        };

        return; // 直接返回，不执行后续的英雄分配逻辑
    }

    // 以下是原有的随机英雄逻辑...
    // 检查英雄池是否足够
    if (!allowRepeat) {
        const needT = is5v5 ? 2 : 4;  // 两队需要的坦克总数
        const needN = 4;               // 两队需要的支援总数
        const needC = is5v5 ? 4 : 4;   // 两队需要的输出总数

        if (heroGroups.T.length < needT) {
            clearInterval(rollInterval);
            modal.style.display = 'none';
            return alert(`英雄池中坦克总数不足以同时满足两队（需要 ${needT} 位，总池 ${heroGroups.T.length}）`);
        }

        if (heroGroups.N.length < needN) {
            clearInterval(rollInterval);
            modal.style.display = 'none';
            return alert(`英雄池中支援总数不足以同时满足两队（需要 ${needN} 位，总池 ${heroGroups.N.length}）`);
        }

        if (heroGroups.C.length < needC) {
            clearInterval(rollInterval);
            modal.style.display = 'none';
            return alert(`英雄池中输出总数不足以同时满足两队（需要 ${needC} 位，总池 ${heroGroups.C.length}）`);
        }

        if (heroGroups.ALL.length < totalPlayers) {
            clearInterval(rollInterval);
            modal.style.display = 'none';
            return alert(`英雄池总数不足以同时满足两队（需要 ${totalPlayers} 位，总池 ${heroGroups.ALL.length}）`);
        }
    } else {
        // 允许重复时的检查
        const tankCount = is5v5 ? 1 : 2;
        const supportCount = 2;
        const damageCount = is5v5 ? 2 : 2;

        if (heroGroups.T.length < tankCount) {
            clearInterval(rollInterval);
            modal.style.display = 'none';
            return alert(`英雄池中 Tank(T) 可用数量不足，每队需 ${tankCount} 个`);
        }

        if (heroGroups.N.length < supportCount) {
            clearInterval(rollInterval);
            modal.style.display = 'none';
            return alert(`英雄池中 Support(N) 可用数量不足，每队需 ${supportCount} 个`);
        }

        if (heroGroups.C.length < damageCount) {
            clearInterval(rollInterval);
            modal.style.display = 'none';
            return alert(`英雄池中 Damage(C) 可用数量不足，每队需 ${damageCount} 个`);
        }
    }

    // 分配英雄
    const usedHeroes = new Set();
    const teamAResult = assignTeamHeroes(teamA, heroGroups, teamA.length, {}, allowRepeat ? new Set() : usedHeroes);

    if (!teamAResult.ok) {
        clearInterval(rollInterval);
        modal.style.display = 'none';
        return alert(teamAResult.reason);
    }

    const teamBResult = assignTeamHeroes(teamB, heroGroups, teamB.length, {}, allowRepeat ? new Set() : usedHeroes);

    if (!teamBResult.ok) {
        clearInterval(rollInterval);
        modal.style.display = 'none';
        return alert(teamBResult.reason);
    }

    await new Promise(resolve => setTimeout(resolve, 600));
    clearInterval(rollInterval);

    // 显示最终结果
    rollText.style.display = 'none';
    finalResult.style.display = 'block';

    // 按角色排序显示
    const roleOrder = {'T': 1, 'C': 2, 'N': 3};

    const sortedTeamA = [...teamA].sort((a, b) => {
        const roleA = roleOrder[parseHero(a.hero)?.role] || 99;
        const roleB = roleOrder[parseHero(b.hero)?.role] || 99;
        return roleA - roleB;
    });

    const sortedTeamB = [...teamB].sort((a, b) => {
        const roleA = roleOrder[parseHero(a.hero)?.role] || 99;
        const roleB = roleOrder[parseHero(b.hero)?.role] || 99;
        return roleA - roleB;
    });
    const randomItem = window.MAP[Math.floor(Math.random() * window.MAP.length)]
    finalResult.innerHTML = `
            <h3>抽取结果</h3>
            <div style="text-align:center;color:#eaecef;font-size:20px;font-weight:bold;margin:18px 0;">地图：${randomItem}</div>
            <table>
                <thead><tr><th>队伍</th><th>玩家</th><th>英雄</th><th>位置</th><th>偏好</th></tr></thead>
                <tbody>
                    ${sortedTeamA.map(player => {
        const heroInfo = parseHero(player.hero);
        const preferredRoleName = player.preferredRole === 'any' ? '任意' :
            player.preferredRole === 'T' ? '🛡️坦克' :
                player.preferredRole === 'C' ? '⚔️输出' : '🩹支援';
        return `
                            <tr class="teamA-row">
                                <td>A 队</td>
                                <td>${player.name}</td>
                                <td>${player.hero}</td>
                                <td>${heroInfo ? heroInfo.role : '-'}</td>
                                <td>${preferredRoleName}</td>
                            </tr>
                        `;
    }).join('')}
                    ${sortedTeamB.map(player => {
        const heroInfo = parseHero(player.hero);
        const preferredRoleName = player.preferredRole === 'any' ? '任意' :
            player.preferredRole === 'T' ? '🛡️坦克' :
                player.preferredRole === 'C' ? '⚔️输出' : '🩹支援';
        return `
                            <tr class="teamB-row">
                                <td>B 队</td>
                                <td>${player.name}</td>
                                <td>${player.hero}</td>
                                <td>${heroInfo ? heroInfo.role : '-'}</td>
                                <td>${preferredRoleName}</td>
                            </tr>
                        `;
    }).join('')}
                </tbody>
            </table>
            <div style="margin-top:12px;">
                <button id="closeModalBtn" class="small-btn">关闭</button>
                <button id="reDrawBtn" class="small-btn" style="margin-left:10px;">重新抽取</button>
            </div>
        `;

    document.getElementById('closeModalBtn').onclick = () => modal.style.display = 'none';
    document.getElementById('reDrawBtn').onclick = () => {
        // 清空英雄分配
        allPlayers.forEach(p => p.hero = '');

        // 禁用按钮防止重复点击
        document.getElementById('reDrawBtn').disabled = true;
        setTimeout(() => document.getElementById('reDrawBtn').disabled = false, 500);

        // 重新开始抽取
        modal.style.display = 'none';
        startDraw();
    };
}