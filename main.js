class PackersTracker {
    constructor() {
        this.apiUrl = 'https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams/gb/schedule';
        this.standingsUrl = 'https://site.api.espn.com/apis/site/v2/sports/football/nfl/standings';
        this.init();
    }

    async init() {
        try {
            await this.fetchPackersData();
            await this.fetchStandingsData();
        } catch (error) {
            this.showError('Failed to load Packers data');
            console.error('Error:', error);
        }
    }

    async fetchPackersData() {
        const response = await fetch(this.apiUrl);
        const data = await response.json();
        this.processScheduleData(data);
    }

    async fetchStandingsData() {
        try {
            const response = await fetch(this.standingsUrl);
            const data = await response.json();
            console.log('Full standings API response:', JSON.stringify(data, null, 2));
            this.processStandingsData(data);
        } catch (error) {
            console.error('Failed to fetch standings:', error);
        }
    }

    processStandingsData(data) {
        // Simple approach: just look for any standings data and filter for NFC North teams
        console.log('Processing standings data...');
        
        // Try to find standings data anywhere in the response
        let allTeams = [];
        
        // Function to extract team data from any standings structure
        const extractTeams = (obj) => {
            if (!obj) return;
            
            if (obj.entries && Array.isArray(obj.entries)) {
                obj.entries.forEach(entry => {
                    if (entry.team && entry.stats) {
                        allTeams.push(entry);
                    }
                });
            }
            
            // Recursively search through all properties
            Object.values(obj).forEach(value => {
                if (typeof value === 'object' && value !== null) {
                    extractTeams(value);
                }
            });
        };
        
        extractTeams(data);
        
        console.log('Found teams:', allTeams.length);
        
        // Filter for NFC North teams
        const nfcNorthTeams = ['GB', 'CHI', 'DET', 'MIN'];
        const nfcNorthStandings = allTeams.filter(entry => 
            nfcNorthTeams.includes(entry.team.abbreviation)
        );
        
        console.log('NFC North teams found:', nfcNorthStandings.length);
        
        if (nfcNorthStandings.length === 0) {
            console.error('Could not find any NFC North teams in standings data');
            return;
        }
        
        const standings = nfcNorthStandings.map(entry => {
            const team = entry.team;
            const stats = entry.stats;
            
            // Find wins, losses, and other relevant stats
            const wins = stats.find(stat => stat.name === 'wins')?.value || 0;
            const losses = stats.find(stat => stat.name === 'losses')?.value || 0;
            const winPercent = stats.find(stat => stat.name === 'winPercent')?.value || 0;
            const divisionRecord = stats.find(stat => stat.name === 'divisionWinPercent')?.displayValue || '0-0';
            
            return {
                name: team.displayName,
                abbreviation: team.abbreviation,
                wins,
                losses,
                winPercent: parseFloat(winPercent),
                divisionRecord,
                isPackers: team.abbreviation === 'GB'
            };
        }).sort((a, b) => b.winPercent - a.winPercent);

        this.displayStandings(standings);
        this.displayPlayoffPicture(standings);
    }

    displayStandings(standings) {
        const standingsEl = document.getElementById('standings');
        const standingsInfo = document.getElementById('standings-info');
        
        let standingsHtml = '<div class="standings-table">';
        standingsHtml += '<div class="standings-header">NFC North Standings</div>';
        
        standings.forEach((team, index) => {
            const position = index + 1;
            const rowClass = team.isPackers ? 'packers-row' : '';
            
            standingsHtml += `
                <div class="standings-row ${rowClass}">
                    <div class="team-position">${position}.</div>
                    <div class="team-name">${team.name}</div>
                    <div class="team-record">${team.wins}-${team.losses}</div>
                    <div class="team-division">${team.divisionRecord}</div>
                </div>
            `;
        });
        
        standingsHtml += '</div>';
        standingsInfo.innerHTML = standingsHtml;
        standingsEl.style.display = 'block';
    }

    displayPlayoffPicture(standings) {
        const playoffEl = document.getElementById('playoff-picture');
        const playoffInfo = document.getElementById('playoff-info');
        
        const packersTeam = standings.find(team => team.isPackers);
        if (!packersTeam) return;
        
        const position = standings.indexOf(packersTeam) + 1;
        let playoffStatus = '';
        let statusClass = '';
        
        if (position === 1) {
            playoffStatus = '🏆 Leading NFC North';
            statusClass = 'leading';
        } else if (position === 2) {
            playoffStatus = '🥈 2nd in NFC North';
            statusClass = 'second';
        } else if (position === 3) {
            playoffStatus = '🥉 3rd in NFC North';
            statusClass = 'third';
        } else {
            playoffStatus = '📉 Last in NFC North';
            statusClass = 'last';
        }
        
        const playoffHtml = `
            <div class="playoff-status ${statusClass}">
                <div class="playoff-title">Playoff Picture</div>
                <div class="playoff-position">${playoffStatus}</div>
                <div class="playoff-record">Record: ${packersTeam.wins}-${packersTeam.losses}</div>
                <div class="playoff-division">Division: ${packersTeam.divisionRecord}</div>
            </div>
        `;
        
        playoffInfo.innerHTML = playoffHtml;
        playoffEl.style.display = 'block';
    }

    processScheduleData(data) {
        const events = data.events || [];
        
        console.log('Total events:', events.length);
        
        // Get completed games
        const completedGames = events.filter(event => {
            const status = event.competitions?.[0]?.status?.type?.name;
            return status === 'STATUS_FINAL';
        });

        console.log('Completed games:', completedGames.length);
        
        let wins = 0;
        let losses = 0;

        // Check each completed game
        completedGames.forEach(event => {
            console.log('Processing game:', event.name);
            const competition = event.competitions[0];
            const competitors = competition.competitors;
            
            let packersScore = 0;
            let opponentScore = 0;
            
            // Find Packers and opponent scores
            competitors.forEach(competitor => {
                console.log('Full competitor object:', competitor);
                console.log('Score object:', competitor.score);
               console.log('Team info:', competitor.team);
                if (competitor.team.abbreviation === 'GB') {
                    packersScore = parseInt(competitor.score.value) || 0;
                } else {
                    opponentScore = parseInt(competitor.score.value) || 0;
                }
            });
            
            console.log('Packers:', packersScore, 'Opponent:', opponentScore);
            
            // Count the result for this game
            if (packersScore > opponentScore) {
                wins++;
                console.log('Packers won this game');
            } else if (packersScore < opponentScore) {
                losses++;
                console.log('Packers lost this game');
            }
        });

        console.log('Final record - Wins:', wins, 'Losses:', losses);
        
        // Display result
        const isUndefeated = losses === 0 && wins > 0;
        this.displayResult(isUndefeated, wins, losses);
        
        // Show games
        this.showGames(events);
        
        // Show last updated
        this.showLastUpdated();
    }

    displayResult(isUndefeated, wins, losses) {
        const answerEl = document.getElementById('answer');
        const recordEl = document.getElementById('record');
        
        if (isUndefeated) {
            answerEl.innerHTML = '🧀 🧀 🧀<br>YES!!!<br>🧀 🧀 🧀';
            answerEl.className = 'answer yes';
            document.body.classList.add('undefeated');
        } else {
            answerEl.textContent = 'NO 😢';
            answerEl.className = 'answer no';
            document.body.classList.remove('undefeated');
        }
        
        recordEl.textContent = `Current Record: ${wins}-${losses}`;
    }

    showGames(events) {
        const now = new Date();
        
        // Previous game
        const previousGames = events.filter(event => {
            const status = event.competitions?.[0]?.status?.type?.name;
            return status === 'STATUS_FINAL';
        }).sort((a, b) => new Date(b.date) - new Date(a.date));

        if (previousGames.length > 0) {
            this.displayPreviousGame(previousGames[0]);
        }

        // Next game
        const upcomingGames = events.filter(event => {
            const gameDate = new Date(event.date);
            const status = event.competitions?.[0]?.status?.type?.name;
            return gameDate > now && status === 'STATUS_SCHEDULED';
        }).sort((a, b) => new Date(a.date) - new Date(b.date));

        if (upcomingGames.length > 0) {
            this.displayNextGame(upcomingGames[0]);
        }
    }

    displayPreviousGame(game) {
        const el = document.getElementById('previous-game');
        const info = document.getElementById('previous-game-info');
        
        const competition = game.competitions[0];
        const competitors = competition.competitors;
        const date = new Date(game.date);
        
        let packersScore = 0;
        let opponentScore = 0;
        let opponent = '';
        let isHome = false;
        
        competitors.forEach(competitor => {
            if (competitor.team.abbreviation === 'GB') {
                packersScore = parseInt(competitor.score.value) || 0;
                isHome = competitor.homeAway === 'home';
            } else {
                opponentScore = parseInt(competitor.score.value) || 0;
                opponent = competitor.team.displayName;
            }
        });
        
        const won = packersScore > opponentScore;
        const result = won ? 'W' : 'L';
        const color = won ? '#4CAF50' : '#f44336';
        
        info.innerHTML = `
            <div style="font-size: 1.2rem; margin-bottom: 0.5rem;">
                ${isHome ? 'vs' : '@'} ${opponent}
            </div>
            <div style="font-size: 1.3rem; color: ${color}; font-weight: bold; margin-bottom: 0.5rem;">
                ${result} ${packersScore}-${opponentScore}
            </div>
            <div style="font-size: 1rem; opacity: 0.9;">
                ${date.toLocaleDateString()}
            </div>
        `;
        
        el.style.display = 'block';
    }

    displayNextGame(game) {
        const el = document.getElementById('next-game');
        const info = document.getElementById('next-game-info');
        
        const competition = game.competitions[0];
        const competitors = competition.competitors;
        const date = new Date(game.date);
        const broadcast = competition.broadcasts?.[0];
        
        // Debug broadcast data
        console.log('Full competition object:', competition);
        console.log('Broadcasts array:', competition.broadcasts);
        console.log('First broadcast:', broadcast);
        
        const network = broadcast?.media?.shortName || 'TBD';
        
        let opponent = '';
        let isHome = false;
        
        competitors.forEach(competitor => {
            if (competitor.team.abbreviation === 'GB') {
                isHome = competitor.homeAway === 'home';
            } else {
                opponent = competitor.team.displayName;
            }
        });
        
        info.innerHTML = `
            <div style="font-size: 1.2rem; margin-bottom: 0.5rem;">
                ${isHome ? 'vs' : '@'} ${opponent}
            </div>
            <div style="font-size: 1rem; opacity: 0.9;">
                ${date.toLocaleDateString()} at ${date.toLocaleTimeString()}
            </div>
            <div style="font-size: 1rem; opacity: 0.9; margin-top: 0.5rem;">
                📺 ${network}
            </div>
        `;
        
        el.style.display = 'block';
    }

    showLastUpdated() {
        const el = document.getElementById('last-updated');
        const now = new Date();
        el.textContent = `Last updated: ${now.toLocaleDateString()} at ${now.toLocaleTimeString()}`;
    }

    showError(message) {
        const answerEl = document.getElementById('answer');
        answerEl.innerHTML = `<div style="color: #ff6b6b;">${message}</div>`;
        answerEl.className = 'answer error';
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new PackersTracker();
});