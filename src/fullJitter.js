/*
  https://www.awsarchitectureblog.com/2015/03/backoff.html
  Explore in the console with:
  [1,2,3,4,5,6,7,8,9,10].map(fullJitter(100, 30*1000))
*/

const fullJitter = (base, cap) => retryCount => {
  const temp = Math.min(cap, Math.pow(base * 2, retryCount))
  return temp / 2 + randomBetween(0, temp / 2)
}

const randomBetween = (min, max) => Math.random() * (max - min) + min

module.exports = fullJitter
