class PackersTracker {
    constructor() {
        // Using NFL API which has more reliable data structure
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
        console.log('Fetching schedule data from:', this.apiUrl);
        const response = await fetch(this.apiUrl, {
            method: 'GET',
            headers: {
                'Accept': 'application/json',
            }
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        console.log('Schedule API Response:', data);
        this.processScheduleData(data);
    }

    processScheduleData(data) {
        console.log('Processing schedule data:', data);
        
        const events = data.events || [];
        console.log('Found events:', events.length);
        
        if (events.length === 0) {
            this.showError('No games found in schedule');
            return;
        }

        // Calculate record and determine if undefeated
        const completedGames = events.filter(event => {
            const competition = event.competitions?.[0];
            const status = competition?.status?.type?.name;
            return status === 'STATUS_FINAL';
        });

        let wins = 0;
        let losses = 0;
        let ties = 0;

        completedGames.forEach(event => {
            const result = this.getGameResult(event.competitions[0]);
            if (result.won) {
                wins++;
            } else if (result.tied) {
                ties++;
            } else {
                losses++;
            }
        });

        const isUndefeated = losses === 0;
        this.displayResult(isUndefeated, wins, losses, ties);

        // Find next and previous games
        const now = new Date();
        
        // Previous game: most recent completed game
        const previousGames = events.filter(event => {
            const gameDate = new Date(event.date);
            const competition = event.competitions?.[0];
            const status = competition?.status?.type?.name;
            return gameDate < now && status === 'STATUS_FINAL';
        }).sort((a, b) => new Date(b.date) - new Date(a.date));

        // Next game: earliest upcoming game
        const upcomingGames = events.filter(event => {
            const gameDate = new Date(event.date);
            const competition = event.competitions?.[0];
            const status = competition?.status?.type?.name;
            return gameDate > now && (status === 'STATUS_SCHEDULED' || status === 'STATUS_PRE_GAME');
        }).sort((a, b) => new Date(a.date) - new Date(b.date));

        console.log('Previous games found:', previousGames.length);
        console.log('Upcoming games found:', upcomingGames.length);

        if (previousGames.length > 0) {
            this.displayPreviousGame(previousGames[0]);
        } else {
            this.displayPreviousGame(null);
        }

        if (upcomingGames.length > 0) {
            this.displayNextGame(upcomingGames[0]);
        } else {
            this.displayNextGame(null);
        }
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

    displayNextGame(game) {
        const nextGameEl = document.getElementById('next-game');
        const nextGameInfoEl = document.getElementById('next-game-info');
        
        if (!game) {
            nextGameInfoEl.innerHTML = '<div style="font-size: 1.2rem; opacity: 0.7;">No upcoming games scheduled</div>';
            nextGameEl.style.display = 'block';
            return;
        }

        console.log('Displaying next game:', game);
        this.renderGameInfo(game, nextGameInfoEl, 'next');
        nextGameEl.style.display = 'block';
    }

    displayPreviousGame(game) {
        const previousGameEl = document.getElementById('previous-game');
        const previousGameInfoEl = document.getElementById('previous-game-info');
        
        if (!game) {
            previousGameInfoEl.innerHTML = '<div style="font-size: 1.2rem; opacity: 0.7;">No recent games found</div>';
            previousGameEl.style.display = 'block';
            return;
        }

        console.log('Displaying previous game:', game);
        this.renderGameInfo(game, previousGameInfoEl, 'previous');
        previousGameEl.style.display = 'block';
    }

    renderGameInfo(game, containerEl, type) {
        const competition = game.competitions[0];
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
            
            gameInfo = `
                <div style="font-size: 1.2rem; margin-bottom: 0.5rem;">
                    ${isHome ? 'vs' : '@'} ${opponent}
                </div>
                <div style="font-size: 1.3rem; color: ${gameResult.won ? '#4CAF50' : gameResult.tied ? '#FFA500' : '#f44336'}; font-weight: bold; margin-bottom: 0.5rem;">
                    ${gameResult.won ? 'W' : gameResult.tied ? 'T' : 'L'} ${gameResult.packersScore}-${gameResult.opponentScore}
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
        }
        
        containerEl.innerHTML = gameInfo;
    }

    getOpponent(competition) {
        const competitors = competition.competitors || [];
        
        for (const competitor of competitors) {
            const team = competitor.team || {};
            if (team.abbreviation !== 'GB' && team.abbreviation !== 'GNB') {
                return team.displayName || team.name || team.shortDisplayName || 'Unknown';
            }
        }
        return 'Unknown';
    }

    isHomeGame(competition) {
        const competitors = competition.competitors || [];
        
        for (const competitor of competitors) {
            const team = competitor.team || {};
            if (team.abbreviation === 'GB' || team.abbreviation === 'GNB') {
                return competitor.homeAway === 'home';
            }
        }
        return false;
    }

    getGameResult(competition) {
        const competitors = competition.competitors || [];
        let packersScore = 0;
        let opponentScore = 0;
        let packersWon = false;
        
        console.log('Getting game result for competition:', competition);
        console.log('Competitors:', competitors);
        
        for (const competitor of competitors) {
            const team = competitor.team || {};
            // Try multiple ways to get the score
            let score = 0;
            if (competitor.score !== undefined && competitor.score !== null) {
                score = parseInt(competitor.score);
            } else if (competitor.team && competitor.team.score !== undefined) {
                score = parseInt(competitor.team.score);
            } else if (competition.competitors && competition.competitors.length > 0) {
                // Sometimes scores are in a different structure
                const competitorData = competition.competitors.find(c => c.id === competitor.id);
                if (competitorData && competitorData.score) {
                    score = parseInt(competitorData.score);
                }
            }
            
            // Ensure score is a valid number
            if (isNaN(score)) {
                score = 0;
            }
            
            console.log('Processing competitor:', {
                teamName: team.displayName,
                abbreviation: team.abbreviation,
                rawScore: competitor.score,
                teamScore: competitor.team?.score,
                finalScore: score,
                winner: competitor.winner,
                homeAway: competitor.homeAway
            });
            
            if (team.abbreviation === 'GB' || team.abbreviation === 'GNB') {
                packersScore = score;
                packersWon = competitor.winner === true;
            } else {
                opponentScore = score;
            }
        }
        
        const tied = packersScore === opponentScore && packersScore > 0;
        const won = packersWon && !tied;
        
        console.log('Final game result:', {
            packersScore,
            opponentScore,
            won,
            tied,
            packersWon
        });
        
        return {
            packersScore,
            opponentScore,
            won,
            tied
        };
    }

    extractTVNetwork(competition) {
        if (competition.broadcasts && competition.broadcasts.length > 0) {
            const broadcast = competition.broadcasts[0];
            return broadcast.network || broadcast.names?.[0] || 'TBD';
        }
        
        if (competition.geoBroadcasts && competition.geoBroadcasts.length > 0) {
            const geoBroadcast = competition.geoBroadcasts[0];
            return geoBroadcast.media?.shortName || 'TBD';
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
            return `${days} day${days !== 1 ? 's' : ''}, ${hours} hour${hours !== 1 ? 's' : ''}, ${minutes} minute${minutes !== 1 ? 's' : ''} until kickoff`;
        } else if (hours > 0) {
            return `${hours} hour${hours !== 1 ? 's' : ''}, ${minutes} minute${minutes !== 1 ? 's' : ''} until kickoff`;
        } else {
            return `${minutes} minute${minutes !== 1 ? 's' : ''} until kickoff`;
        }
    }

    showError(message) {
        const answerEl = document.getElementById('answer');
        answerEl.innerHTML = `<div style="color: #ff6b6b; font-size: 1.5rem;">${message}</div>`;
        answerEl.className = 'answer error';
        
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