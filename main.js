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
            answerEl.textContent = '😊 YES!!! 😊';
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
        
        // Get the next game from the schedule
        const schedule = team.nextEvent?.[0];
        
        if (!schedule) {
            nextGameEl.style.display = 'none';
            return;
        }

        const competition = schedule.competitions?.[0];
        if (!competition) {
            nextGameEl.style.display = 'none';
            return;
        }

        const date = new Date(schedule.date);
        const opponent = this.getOpponent(competition);
        const isHome = this.isHomeGame(competition);
        const tvNetwork = this.extractTVNetwork(competition);
        
        const gameInfo = `
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
    }

    getOpponent(competition) {
        const competitors = competition.competitors || [];
        for (const competitor of competitors) {
            if (competitor.team?.abbreviation !== 'GB') {
                return competitor.team?.displayName || 'Unknown';
            }
        }
        return 'Unknown';
    }

    isHomeGame(competition) {
        const competitors = competition.competitors || [];
        const packersCompetitor = competitors.find(c => c.team?.abbreviation === 'GB');
        return packersCompetitor?.homeAway === 'home';
    }

    extractTVNetwork(competition) {
        console.log('Full competition data:', competition);
        
        // Check broadcasts array
        if (competition.broadcasts && competition.broadcasts.length > 0) {
            console.log('Broadcasts found:', competition.broadcasts);
            
            for (const broadcast of competition.broadcasts) {
                console.log('Checking broadcast:', broadcast);
                
                // Check for network property
                if (broadcast.network) {
                    console.log('Found network:', broadcast.network);
                    return broadcast.network;
                }
                
                // Check for names array
                if (broadcast.names && broadcast.names.length > 0) {
                    console.log('Found names:', broadcast.names);
                    return broadcast.names[0];
                }
                
                // Check for media property
                if (broadcast.media && broadcast.media.shortName) {
                    console.log('Found media shortName:', broadcast.media.shortName);
                    return broadcast.media.shortName;
                }
                
                // Check for television property
                if (broadcast.television) {
                    console.log('Found television:', broadcast.television);
                    return broadcast.television;
                }
            }
        }
        
        // Check geoBroadcasts
        if (competition.geoBroadcasts && competition.geoBroadcasts.length > 0) {
            console.log('GeoBroadcasts found:', competition.geoBroadcasts);
            const geoBroadcast = competition.geoBroadcasts[0];
            if (geoBroadcast.media && geoBroadcast.media.shortName) {
                return geoBroadcast.media.shortName;
            }
        }
        
        console.log('No TV network found, returning TBD');
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