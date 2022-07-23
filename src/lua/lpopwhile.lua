-- A short script to lpop one or more values from a list.  Assumes that the
-- values in the list are json strings.
--
-- This will lpop from KEYS[1] until the value defined in the JSON string at
-- KEYS[2] is greater than KEYS[3], or the end of the list is reached.
--
-- Returns the first record for which the preceding condition holds, else nil.

local listKey = KEYS[1]
local jsonKey = KEYS[2]
local minValue = KEYS[3]

local result = nil

while true do
  local record = redis.call('LPOP', listKey)
  if record == false then break end

  local currentValue = cjson.decode(record)[jsonKey]
  if currentValue ~= nil and currentValue > minValue then
    result = record
    break
  end
end

return result
