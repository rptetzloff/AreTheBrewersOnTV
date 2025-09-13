class PackersTracker {
    constructor() {
        this.apiUrl = 'https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams/9';
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
        console.log('Fetching data from:', this.apiUrl);
        const response = await fetch(this.apiUrl, {
            method: 'GET',
            headers: {
                'Accept': 'application/json',
            }
        });
        console.log('Response status:', response.status);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        console.log('API Response:', data);
        console.log('Team events:', data.team?.events);
        console.log('Team nextEvent:', data.team?.nextEvent);
        this.processData(data);
    }

    processData(data) {
        console.log('Processing data:', data);
        const team = data.team;
        
        if (!team) {
            console.error('No team data found');
            this.showError('No team data available');
            return;
        }
        
        const record = team.record?.items?.[0];
        
        if (!record) {
            console.error('No record found:', team.record);
            this.showError('Could not find season record');
            return;
        }

        const losses = parseInt(record.stats?.find(stat => stat.name === 'losses')?.value || '0');
        const wins = parseInt(record.stats?.find(stat => stat.name === 'wins')?.value || '0');
        const ties = parseInt(record.stats?.find(stat => stat.name === 'ties')?.value || '0');
        
        console.log('Record stats:', { wins, losses, ties });
        
        const isUndefeated = losses === 0;
        
        this.displayResult(isUndefeated, wins, losses, ties);
        this.displayNextGame(team);
        this.displayPreviousGame(team);
    }

    displayResult(isUndefeated, wins, losses, ties) {
        const answerEl = document.getElementById('answer');
        const recordEl = document.getElementById('record');
        const body = document.body;
        
        if (isUndefeated) {
            answerEl.innerHTML = '😊😊😊<br>YES!!!<br>😊😊😊';
            body.classList.add('undefeated');
        } else {
            answerEl.textContent = 'NO 😢';
            body.classList.remove('undefeated');
        }
        
        answerEl.className = `answer ${isUndefeated ? 'yes' : 'no'}`;
        
        let recordText = `${wins}-${losses}`;
        if (ties > 0) {
            recordText += `-${ties}`;
        }
        recordEl.textContent = `Current Record: ${recordText}`;
    }

    displayNextGame(team) {
        const nextGameEl = document.getElementById('next-game');
        const nextGameInfoEl = document.getElementById('next-game-info');
        
        console.log('=== NEXT GAME DEBUG ===');
        console.log('Full team object:', JSON.stringify(team, null, 2));
        
        const now = new Date();
        let nextGame = null;
        
        // First try nextEvent
        if (team.nextEvent && Array.isArray(team.nextEvent) && team.nextEvent.length > 0) {
            console.log('Found nextEvent array:', team.nextEvent);
            nextGame = team.nextEvent[0];
        } else if (team.nextEvent && typeof team.nextEvent === 'object') {
            console.log('Found nextEvent object:', team.nextEvent);
            nextGame = team.nextEvent;
        }
        
        // If no nextEvent, try events array
        if (!nextGame && team.events && Array.isArray(team.events)) {
            console.log('Searching events array for future games:', team.events.length, 'events');
            const futureGames = team.events.filter(event => {
                const gameDate = new Date(event.date);
                const isFuture = gameDate > now;
                console.log(`Event ${event.date}: ${isFuture ? 'FUTURE' : 'PAST'}`);
                return isFuture;
            }).sort((a, b) => new Date(a.date) - new Date(b.date));
            
            if (futureGames.length > 0) {
                nextGame = futureGames[0];
                console.log('Found next game from events:', nextGame);
            }
        }
        
        console.log('=== FINAL NEXT GAME ===', nextGame);
        
        if (!nextGame) {
            nextGameInfoEl.innerHTML = '<div style="font-size: 1.2rem; opacity: 0.7;">No upcoming games found</div>';
            nextGameEl.style.display = 'block';
            return;
        }

        this.renderGameInfo(nextGame, nextGameInfoEl, 'next');
        nextGameEl.style.display = 'block';
    }

    displayPreviousGame(team) {
        const previousGameEl = document.getElementById('previous-game');
        const previousGameInfoEl = document.getElementById('previous-game-info');
        
        console.log('=== PREVIOUS GAME DEBUG ===');
        
        const now = new Date();
        let recentGame = null;
        
        if (team.events && Array.isArray(team.events)) {
            console.log('Searching events array for past games:', team.events.length, 'events');
            const pastGames = team.events.filter(event => {
                const gameDate = new Date(event.date);
                const isPast = gameDate < now;
                console.log(`Event ${event.date}: ${isPast ? 'PAST' : 'FUTURE'}`);
                return isPast;
            }).sort((a, b) => new Date(b.date) - new Date(a.date));
            
            if (pastGames.length > 0) {
                recentGame = pastGames[0];
                console.log('Found recent game from events:', recentGame);
            }
        }
        
        console.log('=== FINAL PREVIOUS GAME ===', recentGame);
        
        if (!recentGame) {
            previousGameInfoEl.innerHTML = '<div style="font-size: 1.2rem; opacity: 0.7;">No recent games found</div>';
            previousGameEl.style.display = 'block';
            return;
        }

        this.renderGameInfo(recentGame, previousGameInfoEl, 'previous');
        previousGameEl.style.display = 'block';
    }

    renderGameInfo(game, containerEl, type) {
        console.log(`=== RENDERING ${type.toUpperCase()} GAME ===`);
        console.log('Game object:', JSON.stringify(game, null, 2));
        
        const competitions = game.competitions || [];
        console.log('Competitions found:', competitions.length);
        
        const competition = competitions[0];
        if (!competition) {
            containerEl.innerHTML = '<div style="font-size: 1.2rem; opacity: 0.7;">Game details not available</div>';
            return;
        }

        console.log('Competition data:', JSON.stringify(competition, null, 2));
        
        const date = new Date(game.date);
        const opponent = this.getOpponent(competition);
        const isHome = this.isHomeGame(competition);
        
        let gameInfo = `
            <div style="font-size: 1.2rem; margin-bottom: 0.5rem;">
                ${isHome ? 'vs' : '@'} ${opponent}
            </div>
            <div style="font-size: 1rem; opacity: 0.9;">
                ${date.toLocaleDateString('en-US', { 
                    weekday: 'long', 
                    year: 'numeric', 
                    month: 'long', 
                    day: 'numeric' 
                })}
            </div>
        `;
        
        if (type === 'previous') {
            const gameResult = this.getGameResult(competition);
            console.log('Game result:', gameResult);
            
            gameInfo = `
                <div style="font-size: 1.2rem; margin-bottom: 0.5rem;">
                    ${isHome ? 'vs' : '@'} ${opponent}
                </div>
                <div style="font-size: 1.3rem; color: ${gameResult.won ? '#4CAF50' : '#f44336'}; font-weight: bold; margin-bottom: 0.5rem;">
                    ${gameResult.won ? 'W' : 'L'} ${gameResult.packersScore}-${gameResult.opponentScore}
                </div>
                <div style="font-size: 1rem; opacity: 0.9;">
                    ${date.toLocaleDateString('en-US', { 
                        weekday: 'long', 
                        year: 'numeric', 
                        month: 'long', 
                        day: 'numeric' 
                    })}
                </div>
            `;
        } else {
            const tvNetwork = this.extractTVNetwork(competition);
            const timeUntil = this.getTimeUntilGame(date);
            
            gameInfo += `
                <div style="font-size: 1.1rem; color: #ffb612; font-weight: bold; margin-bottom: 0.5rem;">
                    ${timeUntil}
                </div>
                <div style="font-size: 1rem; opacity: 0.9;">
                    ${date.toLocaleTimeString('en-US', { 
                        hour: 'numeric', 
                        minute: '2-digit',
                        timeZoneName: 'short'
                    })}
                </div>
                <div style="font-size: 1rem; opacity: 0.9; margin-top: 0.5rem;">
                    📺 ${tvNetwork}
                </div>
            `;
            
            // Start countdown for next games
            this.startCountdown(date, containerEl);
        }
        
        containerEl.innerHTML = gameInfo;
    }

    getOpponent(competition) {
        console.log('=== GETTING OPPONENT ===');
        const competitors = competition.competitors || [];
        console.log('Competitors:', competitors);
        
        for (const competitor of competitors) {
            const team = competitor.team || {};
            console.log('Checking team:', team.abbreviation, team.displayName);
            if (team.abbreviation !== 'GB' && team.abbreviation !== 'GNB') {
                console.log('Found opponent:', team.displayName);
                return team.displayName || team.name || 'Unknown';
            }
        }
        return 'Unknown';
    }

    isHomeGame(competition) {
        console.log('=== CHECKING HOME/AWAY ===');
        const competitors = competition.competitors || [];
        
        for (const competitor of competitors) {
            const team = competitor.team || {};
            console.log('Team:', team.abbreviation, 'HomeAway:', competitor.homeAway);
            if (team.abbreviation === 'GB' || team.abbreviation === 'GNB') {
                const isHome = competitor.homeAway === 'home';
                console.log('Packers are:', isHome ? 'HOME' : 'AWAY');
                return isHome;
            }
        }
        return false;
    }

    getGameResult(competition) {
        console.log('=== GETTING GAME RESULT ===');
        const competitors = competition.competitors || [];
        let packersScore = 0;
        let opponentScore = 0;
        let won = false;
        
        console.log('All competitors:', competitors);
        
        for (const competitor of competitors) {
            const team = competitor.team || {};
            const score = parseInt(competitor.score || '0');
            
            console.log(`Team: ${team.abbreviation}, Score: ${score}, Winner: ${competitor.winner}`);
            
            if (team.abbreviation === 'GB' || team.abbreviation === 'GNB') {
                packersScore = score;
                won = competitor.winner === true;
            } else {
                opponentScore = score;
            }
        }
        
        console.log('Final result:', { packersScore, opponentScore, won });
        
        return {
            packersScore,
            opponentScore,
            won: won
        };
    }

    extractTVNetwork(competition) {
        console.log('=== EXTRACTING TV NETWORK ===');
        console.log('Competition broadcasts:', competition.broadcasts);
        
        if (competition.broadcasts && competition.broadcasts.length > 0) {
            for (const broadcast of competition.broadcasts) {
                console.log('Broadcast:', broadcast);
                
                if (broadcast.network) {
                    return broadcast.network;
                }
                
                if (broadcast.names && broadcast.names.length > 0) {
                    return broadcast.names[0];
                }
                
                if (broadcast.media && broadcast.media.shortName) {
                    return broadcast.media.shortName;
                }
            }
        }
        
        if (competition.geoBroadcasts && competition.geoBroadcasts.length > 0) {
            const geoBroadcast = competition.geoBroadcasts[0];
            if (geoBroadcast.media && geoBroadcast.media.shortName) {
                return geoBroadcast.media.shortName;
            }
        }
        
        return 'TBD';
    }

    getTimeUntilGame(gameDate) {
        const now = new Date();
        const timeDiff = gameDate - now;
        
        if (timeDiff <= 0) {
            return 'Game in progress or completed';
        }
        
        const days = Math.floor(timeDiff / (1000 * 60 * 60 * 24));
        const hours = Math.floor((timeDiff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const minutes = Math.floor((timeDiff % (1000 * 60 * 60)) / (1000 * 60));
        
        if (days > 0) {
            return `${days} day${days !== 1 ? 's' : ''}, ${hours} hour${hours !== 1 ? 's' : ''} until kickoff`;
        } else if (hours > 0) {
            return `${hours} hour${hours !== 1 ? 's' : ''}, ${minutes} minute${minutes !== 1 ? 's' : ''} until kickoff`;
        } else {
            return `${minutes} minute${minutes !== 1 ? 's' : ''} until kickoff`;
        }
    }

    startCountdown(gameDate, containerEl) {
        // Clear any existing countdown
        if (this.countdownInterval) {
            clearInterval(this.countdownInterval);
        }
        
        this.countdownInterval = setInterval(() => {
            const now = new Date();
            if (now >= gameDate) {
                clearInterval(this.countdownInterval);
                return;
            }
            
            const timeUntil = this.getTimeUntilGame(gameDate);
            const countdownEl = containerEl.querySelector('div:nth-child(2)');
            if (countdownEl) {
                countdownEl.textContent = timeUntil;
            }
        }, 60000); // Update every minute
    }

    showError(message) {
        const answerEl = document.getElementById('answer');
        answerEl.innerHTML = `<div style="color: #ff6b6b; font-size: 1.5rem;">${message}</div>`;
        answerEl.className = 'answer error';
        
        // Show placeholder messages on error
        document.getElementById('next-game-info').innerHTML = '<div style="font-size: 1.2rem; opacity: 0.7;">Unable to load game data</div>';
        document.getElementById('previous-game-info').innerHTML = '<div style="font-size: 1.2rem; opacity: 0.7;">Unable to load game data</div>';
        document.getElementById('next-game').style.display = 'block';
        document.getElementById('previous-game').style.display = 'block';
    }
}

// Initialize the tracker when the page loads
document.addEventListener('DOMContentLoaded', () => {
    new PackersTracker();
});