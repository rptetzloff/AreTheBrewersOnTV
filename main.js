class PackersTracker {
    constructor() {
        this.apiUrl = 'https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams/gb/schedule';
        this.countdownInterval = null;
        this.liveUpdateInterval = null;
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
        try {
            const response = await fetch(this.apiUrl);
            const data = await response.json();
            
            // Check for live games and fetch their scores separately
            const events = data.events || [];
            const liveGame = events.find(event => {
                const status = event.competitions?.[0]?.status?.type?.name;
                return status === 'STATUS_IN_PROGRESS' || status === 'STATUS_HALFTIME' || status === 'STATUS_DELAYED';
            });
            
            if (liveGame) {
                console.log('Found live game, fetching detailed score...');
                await this.fetchLiveGameScore(liveGame, data);
            } else {
                this.processScheduleData(data);
            }
        } catch (error) {
            console.error('Error fetching data:', error);
            this.processScheduleData({ events: [] });
        }
    }
    
    async fetchLiveGameScore(liveGame, scheduleData) {
        try {
            // Try to get live score from the boxscore API
            const boxscoreUrl = `https://site.api.espn.com/apis/site/v2/sports/football/nfl/summary?event=${liveGame.id}`;
            const response = await fetch(boxscoreUrl);
            const boxscoreData = await response.json();
            
            console.log('Boxscore data:', boxscoreData);
            
            // Update the live game with boxscore data
            if (boxscoreData.boxscore?.teams) {
                const teams = boxscoreData.boxscore.teams;
                teams.forEach(team => {
                    const teamId = team.team.id;
                    const score = team.statistics?.find(stat => stat.name === 'points')?.displayValue || '0';
                    
                    // Find corresponding competitor in schedule data
                    const competitor = liveGame.competitions[0].competitors.find(comp => comp.team.id === teamId);
                    if (competitor) {
                        competitor.score = { value: score, displayValue: score };
                        console.log(`Updated ${team.team.abbreviation} score to ${score}`);
                    }
                });
            }
            
            this.processScheduleData(scheduleData);
        } catch (error) {
            console.error('Error fetching live score:', error);
            // Fallback to schedule data without live scores
            this.processScheduleData(scheduleData);
        }
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
        
        // Show full schedule
        this.displaySchedule(events);
        
        // Show last updated
        this.showLastUpdated();
        
        // Setup share buttons
        this.setupShareButtons();
    }

    displayResult(isUndefeated, wins, losses) {
        const answerEl = document.getElementById('answer');
        const recordEl = document.getElementById('record');
        
        if (isUndefeated) {
            const cheeseBlocks = wins > 0 ? '🧀 '.repeat(wins).trim() : '';
            answerEl.innerHTML = `${cheeseBlocks}<br>YES!!!`;
            answerEl.className = 'answer yes';
            document.body.classList.add('undefeated');
        } else {
            const cheeseBlocks = wins > 0 ? '🧀 '.repeat(wins).trim() + '<br>' : '';
            const frownFaces = losses > 0 ? '<br>' + '😢 '.repeat(losses).trim() : '';
            answerEl.innerHTML = `${cheeseBlocks}NO${frownFaces}`;
            answerEl.className = 'answer no';
            document.body.classList.remove('undefeated');
        }
        
        recordEl.textContent = `Current Record: ${wins}-${losses}`;
    }

    displaySchedule(events) {
        const scheduleGrid = document.getElementById('schedule-grid');
        const now = new Date();
        
        // Sort events by date
        const sortedEvents = events.sort((a, b) => new Date(a.date) - new Date(b.date));
        
        // Find next game
        const nextGame = sortedEvents.find(event => {
            const gameDate = new Date(event.date);
            const status = event.competitions?.[0]?.status?.type?.name;
            return gameDate > now && status === 'STATUS_SCHEDULED';
        });
        
        // Check for live game
        const liveGame = sortedEvents.find(event => {
            const status = event.competitions?.[0]?.status?.type?.name;
            return status === 'STATUS_IN_PROGRESS' || status === 'STATUS_HALFTIME' || status === 'STATUS_DELAYED';
        });
        
        scheduleGrid.innerHTML = '';
        
        sortedEvents.forEach(event => {
            const gameItem = this.createGameItem(event, nextGame, liveGame, now);
            scheduleGrid.appendChild(gameItem);
        });
        
        // Start live updates if there's a live game
        if (liveGame) {
            this.startLiveUpdates();
        } else if (nextGame) {
            this.startCountdownUpdates(nextGame);
        }
    }
    
    createGameItem(event, nextGame, liveGame, now) {
        const competition = event.competitions[0];
        const competitors = competition.competitors;
        const status = competition.status;
        const date = new Date(event.date);
        
        // Debug live game data structure
        const isLive = liveGame && event.id === liveGame.id;
        if (isLive) {
            console.log('=== LIVE GAME DEBUG ===');
            console.log('Full event object:', event);
            console.log('Competition object:', competition);
            console.log('Status object:', status);
            console.log('Competitors array:', competitors);
            competitors.forEach((comp, index) => {
                console.log(`Competitor ${index}:`, comp);
                console.log(`Team:`, comp.team);
                console.log(`All properties:`, Object.keys(comp));
            });
        }
        
        let packersScore = 0;
        let opponentScore = 0;
        let opponent = '';
        let isHome = false;
        
        competitors.forEach(competitor => {
            if (competitor.team.abbreviation === 'GB') {
                // Try multiple ways to get the score
                packersScore = parseInt(
                    competitor.score?.value || 
                    competitor.score?.displayValue ||
                    competitor.score || 
                    competitor.points ||
                    0
                );
                isHome = competitor.homeAway === 'home';
                if (isLive) {
                    console.log('Packers competitor full object:', competitor);
                    console.log('Packers score found:', packersScore);
                }
            } else {
                // Try multiple ways to get the score
                opponentScore = parseInt(
                    competitor.score?.value || 
                    competitor.score?.displayValue ||
                    competitor.score || 
                    competitor.points ||
                    0
                );
                opponent = competitor.team.displayName;
                if (isLive) {
                    console.log('Opponent competitor full object:', competitor);
                    console.log('Opponent score found:', opponentScore);
                }
            }
        });
        
        const gameItem = document.createElement('div');
        gameItem.className = 'game-item';
        
        // Determine game status and styling
        const isNext = nextGame && event.id === nextGame.id && !isLive;
        const isCompleted = status.type.name === 'STATUS_FINAL';
        const isInProgress = status.type.name === 'STATUS_IN_PROGRESS' || status.type.name === 'STATUS_HALFTIME';
        
        if (isLive) {
            gameItem.classList.add('live');
        } else if (isNext) {
            gameItem.classList.add('next');
        } else if (isCompleted) {
            gameItem.classList.add('completed');
            if (packersScore > opponentScore) {
                gameItem.classList.add('win');
            } else if (packersScore < opponentScore) {
                gameItem.classList.add('loss');
            }
        }
        
        // Create game info
        const gameInfo = document.createElement('div');
        gameInfo.className = 'game-info';
        
        const opponentDiv = document.createElement('div');
        opponentDiv.className = 'game-opponent';
        opponentDiv.textContent = `${isHome ? 'vs' : '@'} ${opponent}`;
        
        const dateDiv = document.createElement('div');
        dateDiv.className = 'game-date';
        
        if (isLive) {
            dateDiv.innerHTML = `<span class="live-indicator-small"></span>LIVE NOW`;
        } else if (isInProgress) {
            dateDiv.innerHTML = `<span class="live-indicator-small"></span>LIVE NOW`;
        } else {
            dateDiv.textContent = date.toLocaleDateString('en-US', {
                weekday: 'short',
                month: 'short',
                day: 'numeric',
                hour: 'numeric',
                minute: '2-digit'
            });
        }
        
        gameInfo.appendChild(opponentDiv);
        gameInfo.appendChild(dateDiv);
        
        // Add countdown for next game
        if (isNext) {
            const countdownDiv = document.createElement('div');
            countdownDiv.className = 'countdown-small';
            countdownDiv.id = `countdown-${event.id}`;
            gameInfo.appendChild(countdownDiv);
        }
        
        // Create game result
        const gameResult = document.createElement('div');
        gameResult.className = 'game-result';
        
        if (isCompleted || isLive || isInProgress) {
            const scoreDiv = document.createElement('div');
            scoreDiv.className = 'game-score';
            
            if (isLive || isInProgress) {
                scoreDiv.classList.add('live');
            } else if (packersScore > opponentScore) {
                scoreDiv.classList.add('win');
            } else if (packersScore < opponentScore) {
                scoreDiv.classList.add('loss');
            }
            
            scoreDiv.textContent = `${packersScore}-${opponentScore}`;
            gameResult.appendChild(scoreDiv);
            
            if (isLive || isInProgress) {
                const statusDiv = document.createElement('div');
                statusDiv.className = 'game-status';
                const period = status.period || 1;
                const clock = status.displayClock || '';
                statusDiv.textContent = `Q${period}${clock ? ` ${clock}` : ''}`;
                gameResult.appendChild(statusDiv);
            }
        } else {
            // Show network for upcoming games
            const broadcast = competition.broadcasts?.[0];
            const network = broadcast?.media?.shortName || 'TBD';
            const networkDiv = document.createElement('div');
            networkDiv.className = 'game-status';
            networkDiv.textContent = `📺 ${network}`;
            gameResult.appendChild(networkDiv);
        }
        
        gameItem.appendChild(gameInfo);
        gameItem.appendChild(gameResult);
        
        return gameItem;
    }
    
    startCountdownUpdates(nextGame) {
        // Clear any existing intervals
        if (this.countdownInterval) {
            clearInterval(this.countdownInterval);
        }
        if (this.liveUpdateInterval) {
            clearInterval(this.liveUpdateInterval);
        }
        
        const gameDate = new Date(nextGame.date);
        const countdownEl = document.getElementById(`countdown-${nextGame.id}`);
        
        if (!countdownEl) return;
        
        const updateCountdown = () => {
            const now = new Date().getTime();
            const gameTime = gameDate.getTime();
            const timeLeft = gameTime - now;
            
            if (timeLeft <= 0) {
                countdownEl.textContent = '🏈 Game Time!';
                clearInterval(this.countdownInterval);
                return;
            }
            
            const days = Math.floor(timeLeft / (1000 * 60 * 60 * 24));
            const hours = Math.floor((timeLeft % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
            const minutes = Math.floor((timeLeft % (1000 * 60 * 60)) / (1000 * 60));
            const seconds = Math.floor((timeLeft % (1000 * 60)) / 1000);
            
            let countdownText = '⏰ ';
            
            if (days > 0) {
                countdownText += `${days}d ${hours}h ${minutes}m`;
            } else if (hours > 0) {
                countdownText += `${hours}h ${minutes}m`;
            } else {
                countdownText += `${minutes}m`;
            }
            
            countdownEl.textContent = countdownText;
        };
        
        updateCountdown();
        this.countdownInterval = setInterval(updateCountdown, 60000); // Update every minute
    }

    startLiveUpdates() {
        // Clear any existing intervals
        if (this.liveUpdateInterval) {
            clearInterval(this.liveUpdateInterval);
        }
        if (this.countdownInterval) {
            clearInterval(this.countdownInterval);
        }
        
        // Update every 30 seconds during live games
        this.liveUpdateInterval = setInterval(async () => {
            try {
                console.log('Updating live game data...');
                await this.fetchPackersData();
            } catch (error) {
                console.error('Error updating live game:', error);
            }
        }, 30000);
    }

    showLastUpdated() {
        const el = document.getElementById('last-updated');
        const now = new Date();
        el.textContent = `Last updated: ${now.toLocaleDateString()} at ${now.toLocaleTimeString()}`;
    }
    
    setupShareButtons() {
        const copyBtn = document.getElementById('share-copy');
        
        copyBtn.addEventListener('click', () => this.copyLink());
    }
    
    getShareMessage() {
        const answerEl = document.getElementById('answer');
        const recordEl = document.getElementById('record');
        
        const isUndefeated = answerEl.textContent.includes('YES');
        const record = recordEl.textContent;
        
        if (isUndefeated) {
            return `🧀 The Green Bay Packers are UNDEFEATED! ${record} 🧀 #GoPackGo`;
        } else {
            return `The Green Bay Packers are ${record} this season. #GoPackGo`;
        }
    }
    
    async copyLink() {
        const copyBtn = document.getElementById('share-copy');
        const message = this.getShareMessage();
        const url = window.location.href;
        const shareText = `${message}\n\nCheck it out: ${url}`;
        
        try {
            await navigator.clipboard.writeText(shareText);
            
            // Visual feedback
            const originalText = copyBtn.innerHTML;
            copyBtn.innerHTML = '<span class="share-icon">✅</span>Copied!';
            copyBtn.classList.add('copy-success');
            
            setTimeout(() => {
                copyBtn.innerHTML = originalText;
                copyBtn.classList.remove('copy-success');
            }, 2000);
            
        } catch (err) {
            // Fallback for older browsers
            const textArea = document.createElement('textarea');
            textArea.value = shareText;
            document.body.appendChild(textArea);
            textArea.select();
            document.execCommand('copy');
            document.body.removeChild(textArea);
            
            // Visual feedback
            const originalText = copyBtn.innerHTML;
            copyBtn.innerHTML = '<span class="share-icon">✅</span>Copied!';
            copyBtn.classList.add('copy-success');
            
            setTimeout(() => {
                copyBtn.innerHTML = originalText;
                copyBtn.classList.remove('copy-success');
            }, 2000);
        }
    }

    showError(message) {
        const answerEl = document.getElementById('answer');
        const recordEl = document.getElementById('record');
        
        if (answerEl) {
            answerEl.innerHTML = `<div style="color: #ff6b6b;">${message}</div>`;
            answerEl.className = 'answer error';
        }
        
        if (recordEl) {
            recordEl.textContent = 'Unable to load data';
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new PackersTracker();
});