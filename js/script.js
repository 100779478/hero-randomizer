// 全局变量
const allPlayers = [];
const teamA = [];
const teamB = [];
const modal = document.getElementById('modal');
const rollText = document.getElementById('rollText');
const finalResult = document.getElementById('finalResult');

// 默认英雄池
let heroPool = [
    'N-无漾', 'N-安娜', 'N-巴蒂斯特', 'N-布丽吉塔', 'N-禅雅塔', 'N-卢西奥', 'N-生命之梭', 'N-天使', 'N-雾子', 'N-伊拉锐', 'N-朱诺',
    'C-弗蕾娅', 'C-艾什', 'C-半藏', 'C-堡垒', 'C-法老之鹰', 'C-黑百合', 'C-黑影', 'C-回声', 'C-卡西迪', 'C-狂鼠', 'C-猎空', 'C-美', 'C-莫伊拉', 'C-士兵76', 'C-死神',
    'C-索杰恩', 'C-探奇', 'C-托比昂', 'C-源氏', 'C-秩序之光',
    'T-奥丽莎', 'T-查莉娅', 'T-D.VA', 'T-骇灾', 'T-拉玛刹', 'T-莱因哈特', 'T-路霸', 'T-毛加', 'T-末日铁拳', 'T-破坏球', 'T-温斯顿', 'T-西格玛', 'T-渣客女王'
];

// 预设玩家数据
const presetPlayers = [
    {name: '狗哥', level: 3, preferredRole: 'any'},
    {name: '小宇', level: 3, preferredRole: 'any'},
    {name: '孙妈', level: 3, preferredRole: 'any'},
    {name: '怪物', level: 3, preferredRole: 'any'},
    {name: '牢fu', level: 3, preferredRole: 'any'},
    {name: '四月樱花🌸', level: 3, preferredRole: 'any'},
    {name: '白', level: 2, preferredRole: 'any'},
    {name: 'xiao99', level: 2, preferredRole: 'any'},
    {name: '🍆', level: 2, preferredRole: 'any'},
    {name: '夏目蓝', level: 2, preferredRole: 'any'},
    {name: '内鬼', level: 2, preferredRole: 'any'},
    {name: '别再打了啦', level: 2, preferredRole: 'any'},
    {name: '嗡嗡叫', level: 2, preferredRole: 'any'},
    {name: '小匕首', level: 1, preferredRole: 'any'},
    {name: '齐格勒', level: 1, preferredRole: 'any'},
    {name: '小怡', level: 1, preferredRole: 'any'},
    {name: '夏风', level: 1, preferredRole: 'any'},
    {name: '包饭', level: 1, preferredRole: 'any'},
    {name: '慢树', level: 1, preferredRole: 'any'},
    {name: '娜姐', level: 1, preferredRole: 'any'},
    {name: '一个人睡着', level: 1, preferredRole: 'any'},
    {name: '明天还会再见吗', level: 1, preferredRole: 'any'},
    {name: '爆炸无敌小恐龙', level: 1, preferredRole: 'any'}
];

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

    // 模式切换
    document.getElementById('customModeBtn').addEventListener('click', switchToCustomMode);
    document.getElementById('selectModeBtn').addEventListener('click', switchToSelectMode);

    // 开始抽取
    document.getElementById('startBtn').addEventListener('click', startDraw);

    // 回车键添加玩家
    document.getElementById('playerNameInput').addEventListener('keypress', function (e) {
        if (e.key === 'Enter') {
            addPlayer();
        }
    });
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
        heroPool = [
            'N-无漾', 'N-安娜', 'N-巴蒂斯特', 'N-布丽吉塔', 'N-禅雅塔', 'N-卢西奥', 'N-生命之梭', 'N-天使', 'N-雾子', 'N-伊拉锐', 'N-朱诺',
            'C-弗蕾娅', 'C-艾什', 'C-半藏', 'C-堡垒', 'C-法老之鹰', 'C-黑百合', 'C-黑影', 'C-回声', 'C-卡西迪', 'C-狂鼠', 'C-猎空', 'C-美', 'C-莫伊拉', 'C-士兵76',
            'C-死神', 'C-索杰恩', 'C-探奇', 'C-托比昂', 'C-源氏', 'C-秩序之光',
            'T-奥丽莎', 'T-查莉娅', 'T-D.VA', 'T-骇灾', 'T-拉玛刹', 'T-莱因哈特', 'T-路霸', 'T-毛加', 'T-末日铁拳', 'T-破坏球', 'T-温斯顿', 'T-西格玛', 'T-渣客女王'
        ];
        renderHeroPool();
    }
}

// 切换到自定义模式
function switchToCustomMode() {
    document.getElementById('customModeBtn').classList.add('active');
    document.getElementById('selectModeBtn').classList.remove('active');
    document.getElementById('customMode').classList.remove('hidden');
    document.getElementById('selectMode').classList.add('hidden');
}

// 切换到选择模式
function switchToSelectMode() {
    document.getElementById('selectModeBtn').classList.add('active');
    document.getElementById('customModeBtn').classList.remove('active');
    document.getElementById('selectMode').classList.remove('hidden');
    document.getElementById('customMode').classList.add('hidden');
    renderPlayerSelector();
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
        <div class="player-option" style="font-size: 12px">
            <div onclick="addPlayerFromList('${player.name}', getSelectedRole(${index}))" 
                 style="cursor: pointer; padding: 8px; border-radius: 6px; background: #2a2a2a;">
                ${player.name}
            </div>
            <div class="role-selector" id="roleSelector-${index}">
                <div class="role-option-btn role-any selected" 
                     onclick="selectRole(${index}, 'any')">任意</div>
                <div class="role-option-btn role-t" 
                     onclick="selectRole(${index}, 'T')">🛡️坦克</div>
                <div class="role-option-btn role-c" 
                     onclick="selectRole(${index}, 'C')">⚔️输出</div>
                <div class="role-option-btn role-n" 
                     onclick="selectRole(${index}, 'N')">🩹支援</div>
            </div>
        </div>
    `).join('');
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
        preferredRole: preferredRole
    });
    renderPlayerList();

    // 清空输入
    nameInput.value = '';
    nameInput.focus();
    levelInput.value = '3';
    roleInput.value = 'any';

    // 如果当前在选择模式，重新渲染选择器
    if (document.getElementById('selectModeBtn').classList.contains('active')) {
        renderPlayerSelector();
    }
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
    allPlayers.splice(index, 1);
    renderPlayerList();
    renderPlayerSelector(); // 重新渲染选择器，恢复被删除的玩家
}

// 根据等级和位置偏好平衡分队
function balanceTeamsByLevel() {
    // 清空队伍
    teamA.length = 0;
    teamB.length = 0;

    // 按等级从高到低排序
    const sortedPlayers = [...allPlayers].sort((a, b) => b.level - a.level);

    // 计算需要的角色数量
    const totalPlayers = allPlayers.length;
    const is5v5 = totalPlayers === 10;
    const requiredTanks = is5v5 ? 1 : 2;
    const requiredSupports = 2;
    const requiredDamage = is5v5 ? 2 : 2;

    console.log(`需要配置: ${requiredTanks}坦 ${requiredSupports}支援 ${requiredDamage}输出`);

    // 优先均衡等级高的玩家，同时考虑位置偏好
    for (let i = 0; i < sortedPlayers.length; i++) {
        const player = sortedPlayers[i];

        // 计算两队当前的总等级和角色分布
        const teamAScore = teamA.reduce((sum, p) => sum + p.level, 0);
        const teamBScore = teamB.reduce((sum, p) => sum + p.level, 0);

        const teamARoles = {
            tank: teamA.filter(p => p.preferredRole === 'T').length,
            support: teamA.filter(p => p.preferredRole === 'N').length,
            damage: teamA.filter(p => p.preferredRole === 'C').length
        };

        const teamBRoles = {
            tank: teamB.filter(p => p.preferredRole === 'T').length,
            support: teamB.filter(p => p.preferredRole === 'N').length,
            damage: teamB.filter(p => p.preferredRole === 'C').length
        };

        // 检查角色限制
        const canAddTankA = teamARoles.tank < requiredTanks;
        const canAddTankB = teamBRoles.tank < requiredTanks;
        const canAddSupportA = teamARoles.support < requiredSupports;
        const canAddSupportB = teamBRoles.support < requiredSupports;
        const canAddDamageA = teamARoles.damage < requiredDamage;
        const canAddDamageB = teamBRoles.damage < requiredDamage;

        // 根据玩家偏好角色决定分配
        if (player.preferredRole === 'T') {
            if (canAddTankA && canAddTankB) {
                // 两队都可以加坦克，按等级平衡分配
                if (teamAScore <= teamBScore) {
                    teamA.push(player);
                } else {
                    teamB.push(player);
                }
            } else if (canAddTankA) {
                teamA.push(player);
            } else if (canAddTankB) {
                teamB.push(player);
            } else {
                // 两队坦克都已满，按任意位置处理
                assignAnyPlayerToTeam(player, teamAScore, teamBScore);
            }
        } else if (player.preferredRole === 'N') {
            if (canAddSupportA && canAddSupportB) {
                if (teamAScore <= teamBScore) {
                    teamA.push(player);
                } else {
                    teamB.push(player);
                }
            } else if (canAddSupportA) {
                teamA.push(player);
            } else if (canAddSupportB) {
                teamB.push(player);
            } else {
                assignAnyPlayerToTeam(player, teamAScore, teamBScore);
            }
        } else if (player.preferredRole === 'C') {
            if (canAddDamageA && canAddDamageB) {
                if (teamAScore <= teamBScore) {
                    teamA.push(player);
                } else {
                    teamB.push(player);
                }
            } else if (canAddDamageA) {
                teamA.push(player);
            } else if (canAddDamageB) {
                teamB.push(player);
            } else {
                assignAnyPlayerToTeam(player, teamAScore, teamBScore);
            }
        } else {
            // 任意位置玩家
            assignAnyPlayerToTeam(player, teamAScore, teamBScore);
        }
    }

    // 确保两队人数相等
    ensureEqualTeamSizes();
}

// 分配任意位置玩家到队伍
function assignAnyPlayerToTeam(player, teamAScore, teamBScore) {
    // 按等级平衡分配
    if (teamAScore <= teamBScore) {
        teamA.push(player);
    } else {
        teamB.push(player);
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

// 更智能的玩家移动选择
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

    // 最后按等级选择（移动等级较低的）
    if (candidates.length > 0) {
        return candidates.reduce((lowest, current) =>
            current.level < lowest.level ? current : lowest
        );
    }

    return fromTeam[0]; // 如果没有合适选择，移动第一个玩家
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

// 为队伍分配英雄（考虑位置偏好）
function assignTeamHeroes(team, heroGroups, teamSize, roleRequirements, usedHeroes = null) {
    const used = new Set();
    if (usedHeroes instanceof Set) {
        for (const hero of usedHeroes) used.add(hero);
    }

    // 清空之前的英雄分配
    team.forEach(player => player.hero = '');

    // 根据队伍大小确定角色配置
    const is5v5 = teamSize === 5;
    const tankCount = is5v5 ? 1 : 2;
    const supportCount = 2;
    const damageCount = is5v5 ? 2 : 2;

    console.log(`为${teamSize}人队伍分配: ${tankCount}坦 ${supportCount}支援 ${damageCount}输出`);

    // 选择英雄的函数（考虑位置偏好）
    function pickHeroes(heroList, count, preferredRole = null) {
        let available = heroList.filter(h => !used.has(h.raw));

        // 如果有偏好角色，优先选择偏好角色的英雄
        if (preferredRole && preferredRole !== 'any') {
            const preferredHeroes = available.filter(h => h.role === preferredRole);
            if (preferredHeroes.length >= count) {
                available = preferredHeroes;
            }
        }

        if (available.length < count) return null;

        const picked = [];
        const tempList = available.slice();

        for (let i = 0; i < count; i++) {
            const index = rndInt(tempList.length);
            picked.push(tempList.splice(index, 1)[0]);
        }

        return picked;
    }

    // 1. 为偏好坦克的玩家分配坦克英雄
    const tankPlayers = team.filter(p => p.preferredRole === 'T').slice(0, tankCount);
    if (tankPlayers.length > 0) {
        const tanks = pickHeroes(heroGroups.T, tankPlayers.length, 'T');
        if (!tanks) return {
            ok: false,
            reason: `英雄池中 Tank(T) 可用数量不足（需要 ${tankPlayers.length} 个）`
        };

        tanks.forEach((tank, idx) => {
            used.add(tank.raw);
            if (tankPlayers[idx]) {
                tankPlayers[idx].hero = tank.raw;
            }
        });
    }

    // 2. 为偏好支援的玩家分配支援英雄
    const supportPlayers = team.filter(p => p.preferredRole === 'N').slice(0, supportCount);
    if (supportPlayers.length > 0) {
        const supports = pickHeroes(heroGroups.N, supportPlayers.length, 'N');
        if (!supports) return {
            ok: false,
            reason: `英雄池中 Support(N) 可用数量不足（需要 ${supportPlayers.length} 个）`
        };

        supports.forEach((support, idx) => {
            used.add(support.raw);
            if (supportPlayers[idx]) {
                supportPlayers[idx].hero = support.raw;
            }
        });
    }

    // 3. 为偏好输出的玩家分配输出英雄
    const damagePlayers = team.filter(p => p.preferredRole === 'C').slice(0, damageCount);
    if (damagePlayers.length > 0) {
        const damages = pickHeroes(heroGroups.C, damagePlayers.length, 'C');
        if (!damages) return {
            ok: false,
            reason: `英雄池中 Damage(C) 可用数量不足（需要 ${damagePlayers.length} 个）`
        };

        damages.forEach((damage, idx) => {
            used.add(damage.raw);
            if (damagePlayers[idx]) {
                damagePlayers[idx].hero = damage.raw;
            }
        });
    }

    // 4. 为剩余玩家分配英雄（按固定配置）
    const remainingPlayers = team.filter(p => !p.hero);

    // 计算还需要什么角色
    const currentTanks = team.filter(p => parseHero(p.hero)?.role === 'T').length;
    const currentSupports = team.filter(p => parseHero(p.hero)?.role === 'N').length;
    const currentDamage = team.filter(p => parseHero(p.hero)?.role === 'C').length;

    const needTanks = Math.max(0, tankCount - currentTanks);
    const needSupports = Math.max(0, supportCount - currentSupports);
    const needDamage = Math.max(0, damageCount - currentDamage);

    console.log(`还需要: ${needTanks}坦 ${needSupports}支援 ${needDamage}输出`);

    // 按顺序分配剩余角色
    let remainingIndex = 0;

    // 分配坦克
    for (let i = 0; i < needTanks && remainingIndex < remainingPlayers.length; i++) {
        const tanks = pickHeroes(heroGroups.T, 1);
        if (!tanks) return {ok: false, reason: '英雄池中 Tank(T) 可用数量不足'};

        used.add(tanks[0].raw);
        remainingPlayers[remainingIndex].hero = tanks[0].raw;
        remainingIndex++;
    }

    // 分配支援
    for (let i = 0; i < needSupports && remainingIndex < remainingPlayers.length; i++) {
        const supports = pickHeroes(heroGroups.N, 1);
        if (!supports) return {ok: false, reason: '英雄池中 Support(N) 可用数量不足'};

        used.add(supports[0].raw);
        remainingPlayers[remainingIndex].hero = supports[0].raw;
        remainingIndex++;
    }

    // 分配输出
    for (let i = 0; i < needDamage && remainingIndex < remainingPlayers.length; i++) {
        const damages = pickHeroes(heroGroups.C, 1);
        if (!damages) return {ok: false, reason: '英雄池中 Damage(C) 可用数量不足'};

        used.add(damages[0].raw);
        remainingPlayers[remainingIndex].hero = damages[0].raw;
        remainingIndex++;
    }

    // 更新已使用的英雄集合
    if (usedHeroes instanceof Set) {
        for (const hero of used) usedHeroes.add(hero);
    }

    return {ok: true};
}

// 开始抽取
async function startDraw() {
    if (allPlayers.length === 0) return alert('请添加至少一名玩家！');

    const totalPlayers = allPlayers.length;
    if (totalPlayers !== 10 && totalPlayers !== 12) return alert('人数错误！5v5 需10人，6v6 需12人。');

    // 先平衡分队
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

        finalResult.innerHTML = `
            <h3>分队结果</h3>
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
                <button id="closeModalBtn">关闭</button>
                <button id="reDrawBtn" style="margin-left:10px;">重新分队</button>
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
            return alert(`英雄池中 Tank(T) 总数不足以同时满足两队（需要 ${needT} 位，总池 ${heroGroups.T.length}）`);
        }

        if (heroGroups.N.length < needN) {
            clearInterval(rollInterval);
            modal.style.display = 'none';
            return alert(`英雄池中 Support(N) 总数不足以同时满足两队（需要 ${needN} 位，总池 ${heroGroups.N.length}）`);
        }

        if (heroGroups.C.length < needC) {
            clearInterval(rollInterval);
            modal.style.display = 'none';
            return alert(`英雄池中 Damage(C) 总数不足以同时满足两队（需要 ${needC} 位，总池 ${heroGroups.C.length}）`);
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

    finalResult.innerHTML = `
        <h3>抽取结果</h3>
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
            <button id="closeModalBtn">关闭</button>
            <button id="reDrawBtn" style="margin-left:10px;">重新抽取</button>
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