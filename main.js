class PackersTracker {
    constructor() {
        this.apiUrl = 'https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams/gb';
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
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        this.processData(data);
    }

    processData(data) {
        const team = data.team;
        const record = team.record?.items?.[0];
        
        if (!record) {
            this.showError('Could not find season record');
            return;
        }

        const losses = parseInt(record.stats?.find(stat => stat.name === 'losses')?.value || '0');
        const wins = parseInt(record.stats?.find(stat => stat.name === 'wins')?.value || '0');
        const ties = parseInt(record.stats?.find(stat => stat.name === 'ties')?.value || '0');
        
        const isUndefeated = losses === 0;
        
        this.displayResult(isUndefeated, wins, losses, ties);
        this.displayNextGame(team);
    }

    displayResult(isUndefeated, wins, losses, ties) {
        const answerEl = document.getElementById('answer');
        const recordEl = document.getElementById('record');
        const body = document.body;
        
        if (isUndefeated) {
            answerEl.textContent = '😊😊😊 YES!!! 😊😊😊';
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
        
        // Get all events from the team data
        const events = team.nextEvent || team.events || [];
        const now = new Date();
        
        // Find the next upcoming game
        let nextGame = null;
        
        for (const event of events) {
            const gameDate = new Date(event.date);
            if (gameDate > now) {
                if (!nextGame || gameDate < new Date(nextGame.date)) {
                    nextGame = event;
                }
            }
        }
        
        if (!nextGame) {
            nextGameEl.style.display = 'none';
            return;
        }

        const competitions = nextGame.competitions || [];
        const competition = competitions[0];
        if (!competition) {
            nextGameEl.style.display = 'none';
            return;
        }

        const date = new Date(nextGame.date);
        const opponent = this.getOpponent(competition);
        const isHome = this.isHomeGame(competition);
        const tvNetwork = this.extractTVNetwork(competition);
        const timeUntil = this.getTimeUntilGame(date);
        
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
        answerEl.textContent = message;
        answerEl.className = 'answer error';
    }
}

// Initialize the tracker when the page loads
document.addEventListener('DOMContentLoaded', () => {
    new PackersTracker();
});