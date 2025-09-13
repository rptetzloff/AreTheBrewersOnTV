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
        
        console.log('Looking for next game in team data:', team);
        
        let nextGame = null;
        const now = new Date();
        
        // Try multiple possible locations for game data
        const possibleEventSources = [
            team.events,
            team.nextEvent ? [team.nextEvent] : null,
            team.schedule?.events,
            team.upcomingEvents
        ].filter(source => source && Array.isArray(source));
        
        console.log('Possible event sources:', possibleEventSources);
        
        for (const eventSource of possibleEventSources) {
            console.log('Checking event source:', eventSource);
            const upcomingGames = eventSource
                .filter(event => {
                    const gameDate = new Date(event.date);
                    console.log('Event date:', event.date, 'Parsed:', gameDate, 'Now:', now, 'Future?', gameDate > now);
                    return gameDate > now;
                })
                .sort((a, b) => new Date(a.date) - new Date(b.date));
            
            console.log('Upcoming games found:', upcomingGames);
            
            if (upcomingGames.length > 0) {
                nextGame = upcomingGames[0];
                break;
            }
        }
        
        console.log('Final next game found:', nextGame);
        
        if (!nextGame) {
            console.log('No next game found, showing placeholder');
            nextGameInfoEl.innerHTML = '<div style="font-size: 1.2rem; opacity: 0.7;">No upcoming games scheduled</div>';
            nextGameEl.style.display = 'block';
            return;
        }

        const competitions = nextGame.competitions || [];
        const competition = competitions[0];
        if (!competition) {
            console.log('No competition data found');
            nextGameInfoEl.innerHTML = '<div style="font-size: 1.2rem; opacity: 0.7;">Game details not available</div>';
            nextGameEl.style.display = 'block';
            return;
        }

        const date = new Date(nextGame.date);
        const opponent = this.getOpponent(competition);
        const isHome = this.isHomeGame(competition);
        const tvNetwork = this.extractTVNetwork(competition);
        const timeUntil = this.getTimeUntilGame(date);
        
        console.log('Game details:', { date, opponent, isHome, tvNetwork, timeUntil });
        
        const gameInfo = `
            <div style="font-size: 1.2rem; margin-bottom: 0.5rem;">
                ${isHome ? 'vs' : '@'} ${opponent}
            </div>
            <div style="font-size: 1.1rem; color: #ffb612; font-weight: bold; margin-bottom: 0.5rem;">
                ${timeUntil}
            </div>
            <div style="font-size: 1rem; opacity: 0.9;">
                ${date.toLocaleDateString('en-US', { 
                    weekday: 'long', 
                    year: 'numeric', 
                    month: 'long', 
                    day: 'numeric' 
                })}
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
        
        nextGameInfoEl.innerHTML = gameInfo;
        nextGameEl.style.display = 'block';
        
        // Update countdown every minute
        this.startCountdown(date, nextGameInfoEl);
    }

    displayPreviousGame(team) {
        const previousGameEl = document.getElementById('previous-game');
        const previousGameInfoEl = document.getElementById('previous-game-info');
        
        console.log('Looking for previous game in team data:', team);
        
        let recentGame = null;
        const now = new Date();
        
        // Try multiple possible locations for game data
        const possibleEventSources = [
            team.events,
            team.schedule?.events,
            team.recentEvents
        ].filter(source => source && Array.isArray(source));
        
        console.log('Possible event sources for previous games:', possibleEventSources);
        
        for (const eventSource of possibleEventSources) {
            console.log('Checking event source for previous games:', eventSource);
            const completedGames = eventSource
                .filter(event => {
                    const gameDate = new Date(event.date);
                    console.log('Event date:', event.date, 'Parsed:', gameDate, 'Now:', now, 'Past?', gameDate < now);
                    return gameDate < now;
                })
                .sort((a, b) => new Date(b.date) - new Date(a.date));
            
            console.log('Completed games found:', completedGames);
            
            if (completedGames.length > 0) {
                recentGame = completedGames[0];
                break;
            }
        }
        
        console.log('Final previous game found:', recentGame);
        
        if (!recentGame) {
            console.log('No previous game found, showing placeholder');
            previousGameInfoEl.innerHTML = '<div style="font-size: 1.2rem; opacity: 0.7;">No recent games found</div>';
            previousGameEl.style.display = 'block';
            return;
        }

        const competitions = recentGame.competitions || [];
        const competition = competitions[0];
        if (!competition) {
            previousGameInfoEl.innerHTML = '<div style="font-size: 1.2rem; opacity: 0.7;">Game details not available</div>';
            previousGameEl.style.display = 'block';
            return;
        }

        const date = new Date(recentGame.date);
        const opponent = this.getOpponent(competition);
        const isHome = this.isHomeGame(competition);
        const gameResult = this.getGameResult(competition);
        
        console.log('Game result:', gameResult);
        
        const gameInfo = `
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
        
        previousGameInfoEl.innerHTML = gameInfo;
        previousGameEl.style.display = 'block';
    }

    getGameResult(competition) {
        const competitors = competition.competitors || [];
        let packersScore = 0;
        let opponentScore = 0;
        let won = false;
        
        for (const competitor of competitors) {
            const team = competitor.team || {};
            const score = parseInt(competitor.score || '0');
            
            if (team.abbreviation === 'GB') {
                packersScore = score;
                won = competitor.winner === true;
            } else {
                opponentScore = score;
            }
        }
        
        console.log('Score details:', { packersScore, opponentScore, won });
        
        return {
            packersScore,
            opponentScore,
            won: won
        };
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

    getOpponent(competition) {
        const competitors = competition.competitors || [];
        for (const competitor of competitors) {
            const team = competitor.team || {};
            if (team.abbreviation !== 'GB') {
                return team.displayName || 'Unknown';
            }
        }
        return 'Unknown';
    }

    isHomeGame(competition) {
        const competitors = competition.competitors || [];
        const packersCompetitor = competitors.find(c => {
            const team = c.team || {};
            return team.abbreviation === 'GB';
        });
        return packersCompetitor ? packersCompetitor.homeAway === 'home' : false;
    }

    extractTVNetwork(competition) {
        if (competition.broadcasts && competition.broadcasts.length > 0) {
            for (const broadcast of competition.broadcasts) {
                if (broadcast.network) {
                    return broadcast.network;
                }
                
                if (broadcast.names && broadcast.names.length > 0) {
                    return broadcast.names[0];
                }
                
                if (broadcast.media && broadcast.media.shortName) {
                    return broadcast.media.shortName;
                }
                
                if (broadcast.television) {
                    return broadcast.television;
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