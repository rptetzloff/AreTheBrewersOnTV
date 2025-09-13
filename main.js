class PackersTracker {
    constructor() {
        this.apiUrl = 'https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams/gb/schedule';
        this.init();
    }

    async init() {
        try {
            await this.fetchPackersData();
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
    }

    displayResult(isUndefeated, wins, losses) {
        const answerEl = document.getElementById('answer');
        const recordEl = document.getElementById('record');
        
        if (isUndefeated) {
            answerEl.innerHTML = '🧀🧀🧀<br>YES!!!<br>🧀🧀🧀';
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
        const network = broadcast?.names?.[0] || 'TBD';
        
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

    showError(message) {
        const answerEl = document.getElementById('answer');
        answerEl.innerHTML = `<div style="color: #ff6b6b;">${message}</div>`;
        answerEl.className = 'answer error';
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new PackersTracker();
});